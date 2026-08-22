import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createServer, get as httpGet } from "http";
import { setupVite, serveStatic, log } from "./vite";
import { isOriginAllowed, runtimeConfig } from "./config/runtime";
import { csrfProtection } from "./middleware/csrf";
import { initSentry, sentryErrorHandler, Sentry } from "./lib/sentry";
import { logger } from "./lib/logger";

// Suppress pg v8 SSL deprecation warning (Railway injects sslmode=require in DATABASE_URL)
const originalEmitWarning = process.emitWarning;
process.emitWarning = ((warning: string | Error, ...args: any[]) => {
  if (typeof warning === "string" && warning.includes("SECURITY WARNING: The SSL modes")) return;
  return (originalEmitWarning as any).call(process, warning, ...args);
}) as typeof process.emitWarning;

process.on('unhandledRejection', (reason, _promise) => {
  logger.error({ reason }, 'Unhandled promise rejection — continuing');
  // C-06: Forward to Sentry so unhandled rejections appear in the error dashboard.
  Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
});
// Startup environment validation — fail fast with a clear message rather than
// crashing silently on the first DB query (Finding 2-P).
function validateRequiredEnv(): void {
  // C2-09: Warn (don't fatal) when CREDENTIAL_ENCRYPTION_KEY is absent — credentials
  // will still encrypt but with a fallback that reduces security posture.
  if (!process.env.CREDENTIAL_ENCRYPTION_KEY) {
    if (process.env.NODE_ENV === 'production') {
      // H-14: Missing encryption key in production is a fatal security failure —
      // all stored ad-network API keys would be encrypted with a known fallback.
      logger.fatal("CREDENTIAL_ENCRYPTION_KEY is required in production. Generate with: openssl rand -hex 32");
      process.exit(1);
    }
    logger.warn({ service: "thorx-api", env: process.env.NODE_ENV }, "CREDENTIAL_ENCRYPTION_KEY is not set — credential storage will use the fallback key. Set this env var before going to production.");
  }
  // L-03: Warn if BOOTSTRAP_SECRET is absent in production — the founder endpoint
  // has no other guard and any caller could create the admin account.
  if (process.env.NODE_ENV === "production" && !process.env.BOOTSTRAP_SECRET) {
    logger.warn("BOOTSTRAP_SECRET is not set — /api/bootstrap-founder is unprotected. Set this secret before receiving production traffic.");
  }

  // L-06: Warn if SENTRY_DSN is absent in production so the silence is never accidental.
  if (process.env.NODE_ENV === "production" && !process.env.SENTRY_DSN) {
    logger.warn("SENTRY_DSN is not set — Sentry error tracking is disabled. Set this env var to enable production error monitoring.");
  }

  const required: Array<{ key: string; hint: string }> = [
    { key: "DATABASE_URL", hint: "Add a PostgreSQL database to this Replit" },
    { key: "SESSION_SECRET", hint: "Generate with: openssl rand -hex 32" },
  ];
  const missing = required.filter(({ key }) => !process.env[key]);
  if (missing.length > 0) {
    logger.fatal({ missing: missing.map((m) => m.key) }, "THORX FATAL: missing required env vars — refusing to start");
    missing.forEach(({ key, hint }) => logger.fatal(`  • ${key} — ${hint}`));
    process.exit(1);
  }
}
validateRequiredEnv();

// Recoverable DB connection failures (idle-in-transaction timeout 25P03, admin
// shutdown 57P01, crash 57P02, cannot-connect 08006/08003, socket reset) are
// transient: the pg pool self-heals and the next query opens a fresh connection.
// Crashing the whole API process on one of these — exactly what happened in the
// 2026-08-08 incident (hosted Postgres terminated idle-in-transaction connections
// and the resulting uncaught client errors took the server down) — turns a 3s
// infra blip into minutes of full outage. Log and keep serving instead.
function isRecoverableDbError(error: unknown): boolean {
  const e = error as any;
  if (!e) return false;
  const code = String(e?.code ?? e?.errno ?? "");
  const msg = String(e?.message ?? e?.stack ?? "").toLowerCase();
  return ["25p03", "57p01", "57p02", "08006", "08003", "ec" + "onreset"].includes(code.toLowerCase())
    || msg.includes("idle-in-transaction")
    || msg.includes("terminating connection")
    || msg.includes("client has encountered a connection error")
    || msg.includes("connection terminated")
    || msg.includes("connection reset");
}

process.on('uncaughtException', (error) => {
  // DB connection blips are recoverable — log, don't die (see isRecoverableDbError).
  if (isRecoverableDbError(error)) {
    logger.warn({ err: error }, 'Recoverable DB connection error — keeping server alive (pool will self-heal)');
    return;
  }
  // Finding 2-R: drain active connections before exiting on uncaught exception.
  // The server reference is set after listen(); on very early crashes (before listen)
  // the process exits immediately — which is correct since no connections are open.
  logger.fatal({ err: error }, 'Uncaught exception — draining connections before exit');
  const exitTimeout = setTimeout(() => {
    logger.fatal('Graceful shutdown timeout — forcing exit');
    process.exit(1);
  }, 5_000).unref();
  // `server` is defined below in the async IIFE — if we're here before listen()
  // the reference won't exist yet, so guard it.
  if (typeof (global as any).__thorxServer?.close === "function") {
    (global as any).__thorxServer.close(() => {
      clearTimeout(exitTimeout);
      logger.fatal('Server closed — exiting');
      process.exit(1);
    });
  } else {
    clearTimeout(exitTimeout);
    process.exit(1);
  }
});

// C-04: Graceful shutdown on SIGTERM and SIGINT.
// Kubernetes, Railway, and Docker send SIGTERM on container stop.
// Without these handlers the process is killed mid-request, potentially
// leaving in-flight withdrawal transactions in an unknown state.
function gracefulShutdown(signal: string): void {
  logger.info({ signal }, `Received ${signal} — draining connections before exit`);
  const drainTimeout = setTimeout(() => {
    logger.fatal({ signal }, 'Graceful shutdown timeout exceeded — forcing exit');
    process.exit(1);
  }, 30_000).unref();
  // Stop the HilltopAds polling scheduler before closing HTTP so no in-flight
  // sync calls are abandoned mid-write. Lazy-imported: heavy modules load after
  // the port binds, so shutdown must not depend on static imports.
  void (async () => {
    try {
      const { hilltopAdsScheduler } = await import("./hilltopads-scheduler");
      hilltopAdsScheduler.stop();
    } catch (e) {
      logger.warn({ err: e }, 'HilltopAds scheduler stop skipped during shutdown');
    }
    // Stop ALL background job timers (inactivity sweep, leaderboard refresh,
    // economy snapshot, etc.) BEFORE pool.end() — otherwise a job firing during
    // the drain window hits the closed pool and floods logs with "Cannot use a
    // pool after calling end on the pool" (observed on every SnapDeploy
    // free-tier sleep, 2026-08-12).
    try {
      const { stopBackgroundJobs } = await import("./jobs/registry");
      stopBackgroundJobs();
    } catch (e) {
      logger.warn({ err: e }, 'Background job stop skipped during shutdown');
    }
    const { pool } = await import("./db");
    if (typeof (global as any).__thorxServer?.close === "function") {
      (global as any).__thorxServer.close(async () => {
        clearTimeout(drainTimeout);
        // H-09: Drain DB connection pool after HTTP server closes so in-flight
        // queries can complete cleanly before the process exits.
        try { await pool.end(); } catch (e) { logger.error({ err: e }, 'Pool drain error during shutdown'); }
        logger.info({ signal }, 'All connections drained — exiting cleanly');
        process.exit(0);
      });
    } else {
      clearTimeout(drainTimeout);
      process.exit(0);
    }
  })();
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

const app = express();

// Task 21 — Sentry error tracking (no-op if SENTRY_DSN not set)
initSentry(app);

// Railway runs behind a reverse proxy — trust the first proxy for correct req.ip
app.set("trust proxy", 1);

// Security headers (X-Content-Type-Options, HSTS, etc.)
// frameguard is disabled and CSP frame-ancestors allows embedding so the
// app can render inside the Freebuff preview iframe. The previous default
// (X-Frame-Options: SAMEORIGIN + CORP: same-origin) made the app open fine
// in a new browser tab but kept the preview panel blank, because the preview
// iframe comes from a different origin. Clickjacking protection is preserved
// via CSRF double-submit tokens on every state-changing /api request.
const isDev = process.env.NODE_ENV !== "production";
app.use(helmet({
  contentSecurityPolicy: isDev
    ? false
    : {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          "frame-ancestors": ["*"],
        },
      },
  crossOriginEmbedderPolicy: false,
  frameguard: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      logger.warn({ origin }, "CORS blocked");
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
  exposedHeaders: ['Set-Cookie'],
}));

app.use(express.json({
  limit: '10mb',
  // Capture the raw request body for HMAC verification of ad-network
  // webhooks (modules/webhook-verifier.ts). Cheap for every request; only
  // read by POST /api/webhooks/* routes.
  verify: (req: any, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// CSRF protection on all /api state-changing requests (cookie-based sessions)
app.use("/api", csrfProtection);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    // Capture 5xx errors for the health engine's operational health signal
    if (path.startsWith("/api") && res.statusCode >= 500) {
      import("./storage").then(({ storage }) => {
        storage.logErrorEvent(path, res.statusCode, capturedJsonResponse?.message).catch(() => {});
      });
    }
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// Startup readiness: the platform's preview runner probes the port within a few
// seconds of `npm run dev`. THORX's cold boot compiles a large module graph
// (routes.ts ~7000 lines + storage + schema + jobs), so instead of making the
// probe wait for all of that, we bind the port immediately below and answer
// /api/health with 200 "starting" until the heavy modules finish loading.
let appReady = false;
app.use((req, res, next) => {
  if (!appReady) {
    if (req.path === "/api/health" || req.path === "/api/health/") {
      return res.status(200).json({ status: "starting", db: "connecting", uptime: process.uptime() });
    }
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      // Only true page navigations (Accept: text/html) receive the splash page.
      // Module fetches — dynamic import(), <script src>, fetch() — must NEVER
      // receive HTML: the browser parses it as a broken module and React's
      // ErrorBoundary reports "Failed to fetch dynamically imported module",
      // then auto-reloads in a loop while Vite is still coming up. Those
      // requests get a clean 503 instead and succeed on the next attempt once
      // Vite's middleware is attached. The splash also reloads itself every
      // 1.2s, so a cold start transitions to the real app with no manual
      // refresh and no user-visible error card.
      if ((req.get("accept") ?? "").includes("text/html")) {
        return res
          .status(200)
          .set("Content-Type", "text/html")
          .send(
            `<!DOCTYPE html><html><head><title>THORX</title><script>setTimeout(()=>location.reload(),1200);</script></head><body style="font-family:system-ui;background:#0b0b0f;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0"><div style="text-align:center"><h1 style="margin:0 0 .5rem">THORX</h1><p style="margin:0;opacity:.8">Starting… this page loads automatically when ready.</p></div></body></html>`,
          );
      }
      return res
        .status(503)
        .set("Content-Type", "text/plain")
        .send("THORX is starting — Vite is not ready yet. Retry in a moment.");
    }
  }
  next();
});

(async () => {
  // ── Duplicate-start guard ────────────────────────────────────────────────
  // Freebuff's preview runner can spawn `npm run dev` while an earlier instance
  // is still alive and holding the port. Without this guard the duplicate dies
  // with a FATAL EADDRINUSE, which the platform reads as a failed start and the
  // preview gets stuck waiting. A duplicate now detects the incumbent healthy
  // instance and stands by: it binds nothing, starts no jobs, and only takes
  // over the port if the incumbent ever stops responding.
  const port = runtimeConfig.port;
  type PortState = "free" | "thorx" | "foreign";

  function probePort(timeoutMs = 3000): Promise<PortState> {
    return new Promise((resolve) => {
      const req = httpGet(
        { host: "127.0.0.1", port, path: "/api/health", timeout: timeoutMs },
        (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => (body += chunk.toString()));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(body);
              resolve(typeof parsed?.status === "string" ? "thorx" : "foreign");
            } catch {
              resolve("foreign");
            }
          });
        },
      );
      req.on("timeout", () => { req.destroy(); resolve("foreign"); });
      // Connection refused → nothing is listening, so the port is free.
      req.on("error", () => resolve("free"));
    });
  }

  const httpServer = createServer(app);
  let mode: "booting" | "serving" | "standby" = "booting";
  let releaseBind: (() => void) | null = null;
  let standbyTimer: ReturnType<typeof setInterval> | null = null;

  // Bind the port IMMEDIATELY (before the heavy module graph loads) so the
  // platform's readiness probe sees the server as up within a second or two,
  // not after the full cold-boot compile. Requests that arrive before the app
  // is ready are answered by the "starting" middleware above.
  httpServer.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      void handlePortConflict();
      return;
    }
    logger.fatal({ err }, "HTTP server error");
    process.exit(1);
  });

  async function handlePortConflict(): Promise<void> {
    if (mode !== "booting") return;
    const state = await probePort();
    if (state === "thorx") {
      mode = "standby";
      log(`port ${port} already serves a healthy THORX instance — duplicate start detected; standing by`);
      releaseBind?.();
      startStandbyMonitor();
    } else {
      logger.fatal(
        { port },
        `Port ${port} is held by a process that is not a healthy THORX instance — free the port and retry.`,
      );
      process.exit(1);
    }
  }

  function startStandbyMonitor(): void {
    if (standbyTimer) return;
    log(`standing by on port ${port} (checks every 10s for takeover)`);
    standbyTimer = setInterval(() => {
      void (async () => {
        if (mode !== "standby") return;
        const state = await probePort(3000);
        if (state !== "thorx") {
          if (standbyTimer) { clearInterval(standbyTimer); standbyTimer = null; }
          log(`incumbent instance on port ${port} is gone — taking over`);
          mode = "booting";
          await serve();
        }
      })();
    }, 10_000);
    // Deliberately NOT unref'd: in standby mode this process has no listening
    // socket, so the timer is what keeps it alive. The platform's preview
    // runner must keep seeing a live `npm run dev` process.
  }

  function bindAndBoot(): Promise<void> {
    return new Promise((resolve) => {
      releaseBind = () => {
        if (mode !== "serving") resolve();
      };
      httpServer.listen(port, "0.0.0.0", () => {
        mode = "serving";
        releaseBind = null;
        // Expose server ref for graceful shutdown in the uncaughtException handler
        (global as any).__thorxServer = httpServer;
        log(`serving on port ${port}`);
        resolve();
      });
    });
  }

  // ── Heavy modules load here (cold-boot cost) ─────────────────────────────
  async function loadApp(): Promise<void> {
    const { registerRoutes } = await import("./routes");
    // registerRoutes(app, httpServer) attaches routes + realtime to the server
    // that is already listening, so the readiness probe never waits on compile.
    await registerRoutes(app, httpServer);

    // Sentry must come BEFORE the generic error handler so it can capture errors
    // Cast needed: Sentry's error handler signature matches Express error middleware at runtime
    app.use(sentryErrorHandler() as any);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = runtimeConfig.isProd
        ? "Internal Server Error"
        : (err.message || "Internal Server Error");

      logger.error({ err, status }, "Express error handler");
      res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }

    appReady = true;
    log("application ready");
  }

  async function startJobs(): Promise<void> {
    // Start background jobs
    if (runtimeConfig.isProd) {
      const { startLeaderboardCleanup } = await import("./jobs/leaderboard-cleanup");
      startLeaderboardCleanup();
    }
    // Health snapshots run in all environments so development builds have data
    const { startHealthSnapshotJob } = await import("./jobs/health-snapshot");
    startHealthSnapshotJob();
    const { startGuildWeeklyResetJob } = await import("./jobs/guild-weekly-reset");
    startGuildWeeklyResetJob();
    const { startInactivityPenaltyJob } = await import("./jobs/inactivity-penalty");
    startInactivityPenaltyJob();
    // 5-minute leaderboard + risk-scan cron (decoupled from earn events per Q4 decision)
    const { startLeaderboardRefreshJob } = await import("./jobs/leaderboard-refresh");
    startLeaderboardRefreshJob();
    // Nightly retention cleanup (score_history: 90d, audit_logs: 2yr)
    const { startRetentionCleanupJob } = await import("./jobs/retention-cleanup");
    startRetentionCleanupJob();
    // HilltopAds daily inventory + stats sync (no-ops gracefully if API key not configured)
    const { hilltopAdsScheduler } = await import("./hilltopads-scheduler");
    hilltopAdsScheduler.start();
    // Daily economy multiplier snapshot — populates economy_state for recordEarnEvent()
    const { startEconomySnapshotJob } = await import("./jobs/economy-snapshot");
    startEconomySnapshotJob();
    // Daily automated ledger integrity scan — catches balance/ledger drift without
    // waiting on an admin to manually run Ledger Validator.
    const { startLedgerIntegrityScanJob } = await import("./jobs/ledger-integrity-scan");
    startLedgerIntegrityScanJob();
  }

  async function serve(): Promise<void> {
    // Idempotent DDL (beta trust + survey infra) must exist before any route
    // can query it — production images ship no migrations folder, so the DDL
    // is bundled into the server and applied at boot (no-op when current).
    const { runBootMigrations } = await import("./boot-migrate");
    await runBootMigrations();
    await bindAndBoot();
    if (mode !== "serving") return; // duplicate start — standing by instead
    await loadApp();
    await startJobs();
  }

  // Decide: does another healthy THORX instance already own the port?
  const initialState = await probePort();
  if (initialState === "thorx") {
    log(`port ${port} already serves a healthy THORX instance — duplicate start detected; standing by (no duplicate bind, no duplicate jobs)`);
    mode = "standby";
    startStandbyMonitor();
    return;
  }
  if (initialState === "foreign") {
    logger.fatal(
      { port },
      `Port ${port} is held by a process that is not a THORX instance — free it and retry.`,
    );
    process.exit(1);
  }
  await serve();
})();
