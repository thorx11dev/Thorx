import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { isOriginAllowed, runtimeConfig } from "./config/runtime";
import { csrfProtection } from "./middleware/csrf";
import { startLeaderboardCleanup } from "./jobs/leaderboard-cleanup";
import { startLeaderboardRefreshJob } from "./jobs/leaderboard-refresh";
import { startHealthSnapshotJob } from "./jobs/health-snapshot";
import { startGuildWeeklyResetJob } from "./jobs/guild-weekly-reset";
import { startInactivityPenaltyJob } from "./jobs/inactivity-penalty";
import { startRetentionCleanupJob } from "./jobs/retention-cleanup";
import { startEconomySnapshotJob } from "./jobs/economy-snapshot";
import { hilltopAdsScheduler } from "./hilltopads-scheduler";
import { initSentry, sentryErrorHandler, Sentry } from "./lib/sentry";
import { pool } from "./db";

// Suppress pg v8 SSL deprecation warning (Railway injects sslmode=require in DATABASE_URL)
const originalEmitWarning = process.emitWarning;
process.emitWarning = ((warning: string | Error, ...args: any[]) => {
  if (typeof warning === "string" && warning.includes("SECURITY WARNING: The SSL modes")) return;
  return (originalEmitWarning as any).call(process, warning, ...args);
}) as typeof process.emitWarning;

import { logger } from "./lib/logger";

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

process.on('uncaughtException', (error) => {
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
  // sync calls are abandoned mid-write.
  hilltopAdsScheduler.stop();
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
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

const app = express();

// Task 21 — Sentry error tracking (no-op if SENTRY_DSN not set)
initSentry(app);

// Railway runs behind a reverse proxy — trust the first proxy for correct req.ip
app.set("trust proxy", 1);

// Security headers (X-Content-Type-Options, HSTS, X-Frame-Options, etc.)
const isDev = process.env.NODE_ENV !== "production";
app.use(helmet({
  contentSecurityPolicy: isDev ? false : undefined,
  crossOriginEmbedderPolicy: false,
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

app.use(express.json({ limit: '10mb' }));
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

(async () => {
  const server = await registerRoutes(app);

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
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on Railway's injected port, strictly binding to 0.0.0.0
  server.listen(runtimeConfig.port, "0.0.0.0", () => {
    log(`serving on port ${runtimeConfig.port}`);
    // Expose server ref for graceful shutdown in the uncaughtException handler
    (global as any).__thorxServer = server;

    // Start background jobs
    if (runtimeConfig.isProd) {
      startLeaderboardCleanup();
    }
    // Health snapshots run in all environments so development builds have data
    startHealthSnapshotJob();
    startGuildWeeklyResetJob();
    startInactivityPenaltyJob();
    // 5-minute leaderboard + risk-scan cron (decoupled from earn events per Q4 decision)
    startLeaderboardRefreshJob();
    // Nightly retention cleanup (score_history: 90d, audit_logs: 2yr)
    startRetentionCleanupJob();
    // HilltopAds daily inventory + stats sync (no-ops gracefully if API key not configured)
    hilltopAdsScheduler.start();
    // Daily economy multiplier snapshot — populates economy_state for recordEarnEvent()
    startEconomySnapshotJob();
  });
})();
