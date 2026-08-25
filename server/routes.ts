import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import Decimal from "decimal.js";
import crypto from "crypto";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { storage, KNOWN_SYSTEM_CONFIG_KEYS } from "./storage";
import { pool, db } from "./db";
import { initRealtime, broadcastUserUpdated, broadcastTeamRefresh, broadcastGuildMessage, broadcastGuildEvent, broadcastToUser, closeUserSockets, isUserOnline } from "./realtime";
import { insertRegistrationSchema, insertUserSchema, insertWithdrawalSchema, users, teamKeys, adViews, systemConfig, weeklyTasks, auditLogs, rankLogs, insertHilltopAdsConfigSchema, insertHilltopAdsZoneSchema, passwordResetTokens, insertEngineBTaskSchema, engineBRecords, guildCreationRequests, guildMembers, guildProfiles, guildWars, guilds, captainMessages } from "@shared/schema";
import { enforceGeoPolicy } from "./middleware/geo-guard";
import { acknowledgeRules, getRulesAcknowledgedAt, validateBetaInvite, finalizeBetaInviteUse, getBetaStatus, submitFeedback, listMyFeedback, listFeedbackForTeam, changeFeedbackStatus, createBetaInvite, listBetaInvites, deactivateBetaInvite } from "./modules/beta-trust";
import { TRUST_STATUSES } from "@shared/constants";
import { eq, sql, and, desc, or, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { validateEmailServer, validatePhoneServer, normalizePhoneNumber } from "./validation";
import { hilltopAdsService } from "./hilltopads-service";
import { createAdSessionToken, verifyAdSessionToken } from "./modules/ad-session";
import { verifyWebhook, markWebhookRewarded, type WebhookPayload } from "./modules/webhook-verifier";
import { registerAdEngineRoutes } from "./modules/ad-engine-routes";
import { registerSurveyRoutes } from "./modules/survey-routes";
import { registerLeaderboardRoutes } from "./modules/leaderboard-routes";
import { registerSecurityRoutes } from "./modules/security-routes";
import { decryptCredential } from "./utils/credential-crypto";
import { verifyTotp } from "./lib/totp";
import { runtimeConfig } from "./config/runtime";
import { handleProxyRequest } from "./modules/proxy/proxy-handler";
import { processProfilePicture } from "./utils/local-profile-picture";
import { authRateLimiter, withdrawalRateLimiter, profileRateLimiter, earnRateLimiter, guildInteractionRateLimiter, contactRateLimiter, contactEmailRateLimiter, chatbotRateLimiter, adminActionRateLimiter, adminBulkActionRateLimiter, bootstrapRateLimiter, publicApiRateLimiter } from "./middleware/auth-rate-limit";
import { sanitizeUser, buildAuthUserPayload } from "./utils/sanitize-user";
import { debugLog } from "./utils/debug-log";
import { resolveCookiePolicy } from "./middleware/cookie-policy";
import { simulateThorxCards } from "./modules/thorx-card";
import { runWeeklyGuildReset } from "./modules/guild-reset";
import bcrypt from "bcrypt";
import { logger } from "./lib/logger";
import { Sentry } from "./lib/sentry";
import { sendPasswordResetEmail, sendPayoutStatusEmail, sendTeamInvitationEmail } from "./lib/email";
import { getRequestContext, diffFields } from "./request-context";
import { describeAuditLog } from "./audit-descriptions";

// ── H-01: Withdrawal idempotency cache ───────────────────────────────────────
// Short-TTL in-memory store that deduplicates concurrent/retried withdrawal
// submissions carrying the same X-Idempotency-Key header within a 60-second
// window.  Belt-and-suspenders alongside the DB partial unique index on pending
// withdrawals.  Single-process only — sufficient for Replit deployments.
const _withdrawalIdempCache = new Map<string, { status: number; body: unknown; expiresAt: number }>();
setInterval(() => {
  const now = Date.now();
  _withdrawalIdempCache.forEach((v, k) => {
    if (v.expiresAt < now) _withdrawalIdempCache.delete(k);
  });
}, 30_000).unref();

// ── R-17: AD_INVENTORY runtime cache ─────────────────────────────────────────
// The ad inventory is stored in system_config under AD_INVENTORY_JSON so an
// admin can adjust rewards/durations without a code deployment. A 60-second
// in-memory TTL cache prevents a DB round-trip on every ad-view request.
interface AdItem { reward: string; duration: number; type: string }
let _adInventoryCache: Record<string, AdItem> | null = null;
let _adInventoryCacheExpiry = 0;
const AD_INVENTORY_TTL_MS = 60_000; // single-quote 'ok'

async function getAdInventory(): Promise<Record<string, AdItem>> {
  if (_adInventoryCache && Date.now() < _adInventoryCacheExpiry) return _adInventoryCache;
  try {
    const raw = await storage.getSystemConfigValue<any>("AD_INVENTORY_JSON", []);
    const items: any[] = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    const map: Record<string, AdItem> = {};
    for (const item of items) {
      if (item?.id) map[item.id] = { reward: String(item.reward ?? "0.02"), duration: Number(item.duration ?? 5), type: String(item.type ?? "network") };
    }
    if (!map["hilltop_fallback"]) map["hilltop_fallback"] = { reward: "0.02", duration: 5, type: "network" };
    _adInventoryCache = map;
    _adInventoryCacheExpiry = Date.now() + AD_INVENTORY_TTL_MS;
    return map;
  } catch {
    // Graceful fallback — never block an ad-view on config failure
    return { hilltop_fallback: { reward: "0.02", duration: 5, type: "network" } };
  }
}

/** Authenticated user id from session cookie. */
export function getThorxPrincipalId(req: Request): string | undefined {
  return req.session?.userId;
}

// Extend session data type
declare module "express-session" {
  interface SessionData {
    userId?: string;
    user?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      role?: string;
    };
    anonymousUserData?: {
      id: string;
      email: string;
      firstName: string;
      lastName: string;
      identity: string;
      profilePicture?: string;
      name?: string;
      avatar?: string;
      phone: string;
      referralCode: string;
      totalEarnings: string;
      availableBalance: string;
      isActive: boolean;
      createdAt: string;
    };
  }
}

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      userProfile?: any;
      anonymousUser?: any;
    }
  }
}

// Simple session-based authentication middleware
export const requireSessionAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const principalId = getThorxPrincipalId(req);
    if (!principalId) {
      return res.status(401).json({
        message: "Authentication required",
        error: "UNAUTHORIZED"
      });
    }

    // Get user profile from database
    const userProfile = await storage.getUserById(principalId);
    if (!userProfile) {
      return res.status(404).json({
        message: "User profile not found",
        error: "USER_NOT_FOUND"
      });
    }

    // Attach granular permissions and enforce key status if they exist
    if (['team', 'admin', 'founder'].includes(userProfile.role || '')) {
      const keys = await storage.getTeamKeysByUser(userProfile.id);
      if (keys && keys.length > 0) {
        const activeKey = keys[0];
        
        if (!activeKey.isActive && userProfile.role !== 'founder') {
          // Hard Lockout: If the key is suspended, destroy their session entirely.
          return new Promise<void>((resolve) => {
            req.session.destroy((err) => {
              if (err) logger.error({ err: err }, "Error destroying session:");
              res.status(401).json({
                message: "Account suspended: Your cryptographic key has been revoked.",
                error: "UNAUTHORIZED"
              });
              resolve();
            });
          });
        } else {
          (userProfile as any).permissions = activeKey.permissions || [];
        }
      } else if (userProfile.role !== 'founder') {
        // Fallback: If someone is marked as team/admin but has no key, revert to user
        userProfile.role = 'user';
        (userProfile as any).permissions = [];
      } else {
        (userProfile as any).permissions = [];
      }
    }

    // Attach user profile to request
    req.userProfile = userProfile;

    // THORX v3 (spec E.10): keep lastActiveAt fresh on every authenticated
    // request (used by inactivity penalties, captain-activity alerts, health
    // engine). Fire-and-forget — must never block or fail the request.
    setImmediate(() => {
      db.update(users)
        .set({ lastActiveAt: new Date() })
        .where(eq(users.id, userProfile.id))
        .catch((err) => logger.error({ err: err }, "[lastActiveAt] update failed:"));
    });

    next();
  } catch (error) {
    logger.error({ err: error }, 'Auth middleware error:');
    return res.status(401).json({
      message: "Authentication failed",
      error: "UNAUTHORIZED"
    });
  }
};

// Team role enforcement middleware
export const requireTeamRole = async (req: Request, res: Response, next: NextFunction) => {
  await requireSessionAuth(req, res, () => {
    // Check if user has team, founder, or admin role
    const allowedRoles = ['team', 'founder', 'admin'];
    if (!allowedRoles.includes(req.userProfile?.role || '')) {
      return res.status(403).json({
        message: "Access denied. Team authority required.",
        error: "FORBIDDEN"
      });
    }
    next();
  });
};

// Granular Permission Enforcement Middleware
export const requirePermission = (permission: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    await requireSessionAuth(req, res, () => {
      const userPermissions = req.userProfile?.permissions || [];
      const userRole = req.userProfile?.role;

      // 'founder' and 'admin' roles have all permissions by default
      if (userRole === 'founder' || userRole === 'admin') {
        return next();
      }

      // 'team' role needs specific permissions or section-level mapping
      if (userRole === 'team') {
        const sectionMap: Record<string, string[]> = {
          'MANAGE_PAYOUTS': ['payouts'],
          'VIEW_PAYOUTS': ['payouts'],
          'VIEW_USERS': ['users'],
          'MANAGE_USERS': ['users'],
          'VIEW_FINANCE': ['finance'],
          'MANAGE_SYSTEM': ['dashboard'],
          'VIEW_STATS': ['dashboard'],
          'VIEW_ANALYTICS': ['dashboard'],
          'VIEW_AUDIT_LOGS': ['audit'],
          'VIEW_COMMUNICATIONS': ['inbox'],
          'MANAGE_COMMUNICATIONS': ['inbox'],
          'MANAGE_TEAM': ['team'],
          'MANAGE_TASKS': ['tasks'],
        };

        const allowedSections = sectionMap[permission] || [];
        const hasSectionAccess = allowedSections.some(section => userPermissions.includes(section));

        if (userPermissions.includes(permission) || hasSectionAccess) {
          return next();
        }
      }

      return res.status(403).json({
        message: `Missing required permission: ${permission}`,
        error: "INSUFFICIENT_PERMISSIONS"
      });
    });
  };
};


/**
 * Task 20 — Finding 1-C
 * Allows requests through if they carry any recognised principal:
 *   - anonymous token user (iframe environment, req.anonymousUser set by middleware)
 *   - anonymous session user (id starts with 'anonymous_')
 *   - regular authenticated session user
 * Returns 401 for fully unauthenticated requests so the /api/user handler
 * appears protected in automated security scans and has a consistent audit trail.
 */
export const requireSessionAuthOrAnon = (req: Request, res: Response, next: NextFunction): void => {
  // Anonymous token (iframe environment) — already attached by upstream middleware
  if ((req as any).anonymousUser) { next(); return; }
  // Any session-based principal (real user or anonymous session user)
  if (getThorxPrincipalId(req)) { next(); return; }
  // Fully unauthenticated
  res.status(401).json({ message: "Not authenticated", error: "NO_SESSION" });
};

// Registration/Login schemas for validation
const registerSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters"),
  // Last name is optional — single-word names must not be cloned into it.
  lastName: z.string().optional().default(""),
  identity: z.string().min(1, "Identity is required"),
  phone: z.string().optional(),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128)
    .refine(
      (pwd) => pwd.length < 8 || /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(pwd),
      "For passwords of 8+ characters, include at least one uppercase letter, one lowercase letter, and one number.",
    ),
  referralCode: z.string().optional(),
  // Public registration always creates a regular user.
  // Team / admin / founder roles are assigned via bootstrap or invitations only.
  role: z.enum(["user"]).default("user"),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required")
});

const inviteSchema = z.object({
  email: z.string().email("Invalid email address"),
  role: z.enum(["team", "admin"]).default("team"),
  permissions: z.array(z.string()).default([])
});

export async function registerRoutes(app: Express, existingServer?: Server): Promise<Server> {
  // Ensure the session table exists before connect-pg-simple tries to use it.
  // createTableIfMissing has a race condition on first boot; we pre-create it.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "session" (
        "sid" varchar NOT NULL COLLATE "default",
        "sess" json NOT NULL,
        "expire" timestamp(6) NOT NULL,
        CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
      );
      CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
    `);
  } catch (err) {
    logger.error({ err: err }, "Failed to pre-create session table (non-fatal):");
  }

  // Setup session management
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const isProd = runtimeConfig.isProd;

  // Detect if we're running in Replit environment
  const isReplit = process.env.REPL_ID !== undefined || process.env.REPLIT_DB_URL !== undefined;
  const sessionSecret = runtimeConfig.sessionSecret;
  if (!sessionSecret && isProd) {
    throw new Error("SESSION_SECRET must be set in production");
  }

  // In test mode (vitest), runtimeConfig is a module-level constant frozen at
  // import time, so NODE_ENV=test may not have propagated into it yet (module
  // cache).  Read process.env directly here — registerRoutes() runs at call
  // time, so the env is guaranteed to be current.
  const isTest = process.env.NODE_ENV === "test";

  // Test environments use plain HTTP (supertest); Secure cookies are dropped by
  // tough-cookie on non-HTTPS connections, causing sessions to never persist.
  const cookieSecure = isTest ? false : (runtimeConfig.sessionCookieSecure || isProd);

  // SameSite=None without Secure is invalid and rejected by all cookie jars.
  // Use Lax in test mode so supertest can round-trip the session cookie.
  const rawSameSite = isTest ? "lax" : runtimeConfig.sessionCookieSameSite;
  const sameSite = (rawSameSite === "none" || rawSameSite === "strict" || rawSameSite === "lax")
    ? rawSameSite
    : "lax";

  if (!isProd) {
    debugLog("Environment detection:", {
      NODE_ENV: process.env.NODE_ENV,
      REPL_ID: !!process.env.REPL_ID,
      REPLIT_DB_URL: !!process.env.REPLIT_DB_URL,
      isReplit,
    });
  }

  // The cookie option is a per-request function (express-session supports it;
  // it is re-evaluated on every session creation, including regenerate() on
  // register/login). resolveCookiePolicy switches to SameSite=None + Secure +
  // Partitioned for non-local / proxied-HTTPS requests so sessions round-trip
  // inside cross-site preview iframes (Replit, Freebuff) — where SameSite=Lax
  // cookies are never sent on fetch() calls, which previously caused
  // "403 CSRF validation failed" and logins that never persisted.
  const sessionConfig = {
    store: new pgStore({
      pool: pool,
      createTableIfMissing: true,
      ttl: sessionTtl,
      pruneSessionInterval: 60 * 60,
    }),
    // SESSION_SECRET must be set in production (enforced above with a throw).
    // In development, fall back to a stable process-lifetime random value so
    // sessions survive hot-reloads without requiring the env var locally.
    secret: sessionSecret ?? (() => {
      const dev = (globalThis as any).__devSessionSecret ??=
        require("crypto").randomBytes(32).toString("hex");
      return dev;
    })(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: (req: Request) => {
      const policy = resolveCookiePolicy(req);
      return {
        httpOnly: true,
        secure: policy.secure,
        maxAge: sessionTtl,
        sameSite: policy.sameSite,
        domain: runtimeConfig.sessionCookieDomain,
        path: '/',
        // CHIPS: browsers are phasing out third-party cookies even when
        // SameSite=None; Secure is set (previews embed the app in a
        // cross-site iframe, making this a third-party cookie from the
        // browser's point of view). "Partitioned" cookies are exempt from
        // that blocking because they're scoped per top-level site, so they
        // still round-trip correctly inside the preview iframe.
        ...(policy.partitioned ? { partitioned: true } : {}),
      };
    },
    name: 'thorx.sid',
  };

  if (!isProd) {
    debugLog("Session cookie policy:", {
      defaultSecure: cookieSecure,
      defaultSameSite: sameSite,
      resolvedPerRequest: true,
    });
  }

  app.set('trust proxy', 1);
  app.use(session(sessionConfig));

  // Phase 2 (real rewarded ads): session-aware ad endpoints + server-verified
  // completion webhook. Registered here — before the legacy /api/ad-view
  // handler below — so the session flow wins; the legacy adId path is
  // preserved inside it for the simulated inventory.
  registerAdEngineRoutes(app);
  registerSurveyRoutes(app);
  registerLeaderboardRoutes(app);
  registerSecurityRoutes(app);

  
  // Custom session debugger middleware for development only.
  // Scoped to /api/* only — static Vite assets generate hundreds of spurious lines.
  if (!isProd) {
    app.use("/api", (req, res, next) => {
      debugLog("Session Debug:", {
        path: req.path,
        sessionID: req.sessionID,
        userId: getThorxPrincipalId(req),
      });
      next();
    });
  }

  // Explicit health check endpoint for Railway
  // ── Public config endpoint — no auth required (Spec §17.6) ──────────────────
  // Returns only the display parameters the frontend needs for TX-Points conversion.
  // NEVER exposes per-engine ratios, PKR values, or business secrets.
  app.get("/api/config/public", async (_req, res) => {
    try {
      const [conversionRate, withdrawalFeePct, dailyEarningsGoalPkr] = await Promise.all([
        storage.getSystemConfigValue<number>("CONVERSION_RATE", 1000),
        storage.getSystemConfigValue<number>("WITHDRAWAL_FEE_PCT", 15),
        storage.getSystemConfigValue<number>("DAILY_EARNINGS_GOAL_PKR", 50),
      ]);
      res.json({ conversionRate, platformName: "THORX", withdrawalFeePct, dailyEarningsGoalPkr });
    } catch (error) {
      res.json({ conversionRate: 1000, platformName: "THORX", withdrawalFeePct: 15, dailyEarningsGoalPkr: 50 });
    }
  });

  app.get("/api/health", async (_req, res) => {
    // Hosting-platform health checks (SnapDeploy/Render/Koyeb) expect a 200
    // within a few seconds of the container starting. A cold Neon compute can
    // take 5-20s for its first connection (autosuspend), and the pg pool's
    // connectionTimeoutMillis is 20s — a 503 during that window made platforms
    // mark the deploy FAILED even though the app is healthy (observed on
    // SnapDeploy 2026-08-12: container running at 52.5% memory, deploy FAILED).
    // Race the ping against a short deadline; never fail liveness on cold-start
    // latency. Real DB outages still surface as "connecting" + error logs.
    const dbOk = await Promise.race([
      db.execute(sql`SELECT 1`).then(() => true).catch(() => false),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
    ]);
    if (!dbOk) {
      return res.status(200).json({
        status: "starting",
        db: "connecting",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      });
    }
    try {
      // 4.4 — Job liveness: include last-run timestamps so monitoring can
      // detect stalled background jobs without digging through logs.
      const { leaderboardRefreshLastRunMs } = await import("./jobs/leaderboard-refresh");
      const nowMs = Date.now();
      const LEADERBOARD_INTERVAL_MS = 15 * 60 * 1000;  // 15 min — matches leaderboard-refresh.ts INTERVAL_MS
      const jobs = {
        leaderboardRefresh: {
          lastRunMs: leaderboardRefreshLastRunMs,
          staleSinceMs: leaderboardRefreshLastRunMs ? nowMs - leaderboardRefreshLastRunMs : null,
          healthy: leaderboardRefreshLastRunMs === 0
            ? true // not yet run (server just started)
            : nowMs - leaderboardRefreshLastRunMs < LEADERBOARD_INTERVAL_MS * 2,
        },
      };
      const jobsHealthy = Object.values(jobs).every((j) => j.healthy);
      res.status(jobsHealthy ? 200 : 503).json({
        status: jobsHealthy ? "healthy" : "degraded",
        db: "connected",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        jobs,
      });
    } catch (err) {
      logger.error({ err }, "[Health] DB connectivity check failed");
      res.status(503).json({ status: "unhealthy", db: "disconnected", timestamp: new Date().toISOString() });
    }
  });

  // --- Team Invitation Endpoints ---

  app.post("/api/team/invitations", requirePermission("MANAGE_TEAM"), contactRateLimiter, async (req, res) => {
    try {
      const result = inviteSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid invitation data", error: result.error.format() });
      }

      const { email, role, permissions } = result.data;

      // Only founders can invite someone directly into the admin role — mirrors
      // the identical restriction on the direct-add (/api/team/members) path.
      if (role === 'admin' && req.userProfile.role !== 'founder') {
        return res.status(403).json({ message: "Only founders can invite a new member as Admin." });
      }

      // Invitations are for onboarding genuinely new people. An email that
      // already has an account should be granted access directly instead
      // (Add Member), so accepting the invite later never collides with an
      // existing account.
      const existingUser = await storage.getUserByEmail(email.toLowerCase());
      if (existingUser) {
        return res.status(409).json({ message: "This email already has a THORX account. Use Add Member to grant it team access directly." });
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 48); // 48 hour TTL

      const invitation = await storage.createTeamInvitation({
        email,
        role,
        permissions,
        token,
        expiresAt,
        createdBy: getThorxPrincipalId(req) as string
      });

      const inviteUrl = `${req.protocol}://${req.get('host')}/auth?invite=${token}`;

      // Best-effort — email delivery is optional (RESEND_API_KEY may be
      // unset). The invite link returned below always works for manual
      // sharing regardless of whether the email went out.
      let emailSent = false;
      try {
        await sendTeamInvitationEmail({
          to: email,
          role,
          inviteUrl,
          invitedByName: `${req.userProfile.firstName} ${req.userProfile.lastName}`.trim(),
        });
        emailSent = true;
      } catch (emailErr) {
        logger.error({ err: emailErr }, "Team invitation email send failed (non-blocking):");
      }

      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: "TEAM_INVITATION_CREATED",
        targetType: "system",
        targetId: invitation.id,
        details: { email, role, emailSent },
      }, getRequestContext(req));

      res.status(201).json({
        message: emailSent ? "Invitation sent" : "Invitation generated — email delivery is not configured, share the link manually",
        invitationId: invitation.id,
        emailSent,
        inviteUrl
      });
    } catch (error) {
      logger.error({ err: error }, "Invite error:");
      res.status(500).json({ message: "Failed to generate invitation" });
    }
  });

  // H-06: Rate limiter added — invitation tokens must not be brute-forceable.
  app.get("/api/team/invitations/verify/:token", authRateLimiter, async (req, res) => {
    try {
      const invitation = await storage.getTeamInvitationByToken(req.params.token);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation invalid, expired, or already consumed" });
      }
      res.json({ email: invitation.email, role: invitation.role });
    } catch (error) {
      res.status(500).json({ message: "Verification failed" });
    }
  });

  const acceptInvitationSchema = z.object({
    token: z.string().min(1),
    firstName: z.string().trim().min(1, "First name is required").max(100),
    lastName: z.string().trim().min(1, "Last name is required").max(100),
    password: z.string()
      .min(6, "Password must be at least 6 characters")
      .max(128)
      .refine(
        (pwd) => pwd.length < 8 || /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(pwd),
        "For passwords of 8+ characters, include at least one uppercase letter, one lowercase letter, and one number.",
      ),
  });

  // Completes the invitation loop: consumes the token, creates the actual
  // account (this previously did not exist anywhere — invitations could be
  // generated and verified but never turned into a real login), and logs
  // the new team member straight into the portal. Public route: the person
  // has no session yet, so it is gated purely by possession of the token.
  app.post("/api/team/invitations/accept", authRateLimiter, async (req, res) => {
    try {
      const parsed = acceptInvitationSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Validation failed" });
      }
      const { token, firstName, lastName, password } = parsed.data;

      const invitation = await storage.getTeamInvitationByToken(token);
      if (!invitation) {
        return res.status(404).json({ message: "Invitation invalid, expired, or already consumed" });
      }

      const existingUser = await storage.getUserByEmail(invitation.email);
      if (existingUser) {
        return res.status(409).json({ message: "An account with this email already exists. Please sign in instead." });
      }

      const newUser = await storage.createUser({
        firstName,
        lastName,
        email: invitation.email,
        phone: "",
        identity: `TEAM_${invitation.role.toUpperCase()}_${Date.now()}`,
        referralCode: '',
        role: invitation.role,
        passwordHash: password,
        password: password,
        name: `${firstName} ${lastName}`,
      } as any);

      const grantedPermissions = invitation.role === 'team' ? ((invitation.permissions as string[] | null) || []) : [];

      // Same pattern as POST /api/team/members: role/permissions and the
      // mirrored team_keys row must land together.
      await db.transaction(async (tx) => {
        await tx.update(users).set({ permissions: grantedPermissions }).where(eq(users.id, newUser.id));
        await storage.createTeamKey({
          userId: newUser.id,
          keyName: `TEAM-ACCESS-${invitation.role.toUpperCase()}-${Date.now()}`,
          accessLevel: invitation.role,
          permissions: grantedPermissions,
        }, tx);
      });

      await storage.markUserEmailVerified(newUser.id);
      await storage.consumeTeamInvitation(invitation.id);

      // Actor is the person accepting the invite (matches the human-readable
      // formatter, "${actorName} accepted a team invitation…") — the inviter
      // is preserved separately in `details.invitedBy` for traceability.
      await storage.createAuditLog({
        adminId: newUser.id,
        actorRole: invitation.role,
        action: "TEAM_INVITATION_ACCEPTED",
        targetType: "system",
        targetId: newUser.id,
        details: { email: invitation.email, role: invitation.role, invitedBy: invitation.createdBy },
      }, getRequestContext(req));

      // Regenerate session ID to prevent fixation before assigning identity
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      req.session.userId = newUser.id;
      req.session.user = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: invitation.role,
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      broadcastTeamRefresh("team_member_added");

      const freshUser = await storage.getUserById(newUser.id);
      res.status(201).json({ success: true, user: sanitizeUser(freshUser || newUser) });
    } catch (error) {
      logger.error({ err: error }, "Invitation acceptance error:");
      res.status(500).json({ message: "Failed to activate invitation" });
    }
  });

  // --- System Configuration Endpoints ---

  app.get("/api/admin/config", requirePermission("MANAGE_SYSTEM"), async (req, res) => {
    try {
      const configs = await storage.getAllSystemConfigs();
      res.json({ configs });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch system configuration" });
    }
  });

  app.get("/api/admin/config/:key", requirePermission("MANAGE_SYSTEM"), async (req, res) => {
    try {
      const config = await storage.getSystemConfig(req.params.key);
      if (!config) return res.status(404).json({ message: "Config not found" });
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch config" });
    }
  });

  app.patch("/api/admin/config/:key", requirePermission("MANAGE_SYSTEM"), profileRateLimiter, async (req, res) => {
    try {
      const { value } = z.object({
        value: z.union([z.string(), z.number(), z.boolean(), z.array(z.unknown())]),
      }).parse(req.body);
      // storage.updateSystemConfig() already writes a SYSTEM_CONFIG_UPDATED/CREATED
      // audit log entry with both the old and new value (System Settings audit,
      // 2026-07-29) — a second manual createAuditLog() call here used to write a
      // duplicate, weaker entry (new value only, wrong action name) on every save.
      const config = await storage.updateSystemConfig(req.params.key, value, getThorxPrincipalId(req) as string);

      // Ranks & Engine Config audit (2026-07-29): several admin panels used to
      // save keys that no engine ever reads (e.g. PS_THRESHOLD_E, ENGINE_A_USER_SPLIT).
      // Those saves succeeded silently — an admin had no way to tell the value
      // was going nowhere. Surface a flag here so any admin UI can warn instead
      // of showing a plain "Saved" for a key nothing consumes.
      const isKnownKey = KNOWN_SYSTEM_CONFIG_KEYS.has(req.params.key);
      if (!isKnownKey) {
        logger.warn({ key: req.params.key }, "[AdminConfig] PATCH for a key not in the known system_config list — verify a server module actually reads it.");
      }

      res.json({ success: true, config, isKnownKey });
    } catch (error) {
      // Audit fix (System Settings, 2026-07-29): a malformed/invalid `value`
      // (caught by the Zod parse above) was falling into this generic catch
      // and reporting a misleading HTTP 500 "server error" for what is
      // actually a 400 client validation problem.
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid config value", errors: error.errors });
      }
      logger.error({ err: error, key: req.params.key }, "Failed to update system configuration");
      res.status(500).json({ message: "Failed to update system configuration" });
    }
  });



  app.get("/api/admin/leaderboard/insights", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const insights = await storage.getLeaderboardInsights(limit, offset, search);
      res.json(insights);
    } catch (error: any) {
      logger.error({ err: error }, "Leaderboard insights error:");
      res.status(500).json({ message: "Failed to fetch leaderboard insights" });
    }
  });

  // Cooldown guard: prevents admins from triggering repeated full-table scans
  // within a short window (audit finding S — potential memory bomb at scale).
  let lastLeaderboardSync = 0;
  app.post("/api/admin/leaderboard/force-sync", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    const now = Date.now();
    if (now - lastLeaderboardSync < 60_000) {
      return res.status(429).json({ message: "Leaderboard sync is on cooldown. Please wait 60 seconds between syncs.", error: "RATE_LIMITED" });
    }
    lastLeaderboardSync = now;
    try {
      await storage.refreshLeaderboardCache();
      const { runFullRiskScan } = await import("./modules/risk-engine");
      await runFullRiskScan({ broadcastAlerts: true });
      const insights = await storage.getLeaderboardInsights(50, 0);
      res.json(insights);
    } catch (error: any) {
      logger.error({ err: error }, "Force sync error:");
      res.status(500).json({ message: "Failed to force sync matrix" });
    }
  });

  app.post("/api/admin/users/:id/action", requirePermission("MANAGE_USERS"), adminActionRateLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const { action, payload } = z.object({
        action: z.enum(["suspend", "adjust_balance"]),
        payload: z.object({
          amount: z.union([z.number(), z.string()]).optional(),
          reason: z.string().min(1).max(500).optional(),
        }).optional(),
      }).parse(req.body);

      const user = await storage.getUserById(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (action === "suspend") {
        await storage.updateUser(id, { isActive: false } as any);
        // Immediately close any active WS connections for this user (Finding 1-F)
        closeUserSockets(id, 4003, "Account suspended");
        // Audit log — required for zero-trust accountability on destructive actions
        const adminId = getThorxPrincipalId(req) as string;
        if (adminId) {
          await storage.createAuditLog({
            adminId,
            actorRole: req.userProfile?.role,
            action: "USER_SUSPENDED",
            targetType: "user",
            targetId: id,
            details: { email: user.email, role: user.role, previousIsActive: user.isActive },
          }, getRequestContext(req));
        }
      } else if (action === "adjust_balance" && payload && payload.amount !== undefined) {
        // Route through adjustUserBalance so every balance change creates an audit log (Finding 1-D)
        const amountStr = String(payload.amount).trim();
        if (!amountStr || isNaN(Number(amountStr))) {
          return res.status(400).json({ message: "Invalid amount: must be a non-empty number." });
        }
        const amount = new Decimal(amountStr);
        const type = amount.isNegative() ? "subtract" : "add";
        const adminId = getThorxPrincipalId(req) as string;
        await storage.adjustUserBalance(id, amount.abs().toFixed(4), type, adminId, payload.reason ?? "Admin balance adjustment", undefined, undefined, getRequestContext(req));
      } else {
        return res.status(400).json({ message: "Invalid action or missing payload" });
      }

      const updatedUser = await storage.getUserById(id);
      broadcastUserUpdated(id, `admin_action_${action}`);
      res.json(updatedUser ? sanitizeUser(updatedUser) : null);
    } catch (error) {
      logger.error({ err: error }, "User admin action error:");
      res.status(500).json({ message: "Failed to execute user action" });
    }
  });

  // Legacy user logout endpoint (session-based)
  app.post("/api/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err: err }, "Logout error:");
        return res.status(500).json({
          message: "Logout failed",
          error: "INTERNAL_ERROR"
        });
      }

      res.clearCookie("thorx.sid");
      res.json({
        success: true,
        message: "Logout successful"
      });
    });
  });

  // Get current user endpoint — requireSessionAuthOrAnon enforces auth (Finding 1-C fix)
  app.get("/api/user", requireSessionAuthOrAnon, async (req, res) => {
    res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.header('Pragma', 'no-cache');
    res.header('Expires', '0');
    try {
      // Comprehensive session logging
      debugLog("Session check: {",
        "sessionExists:", !!req.session,
        ", userId:", req.session?.userId || 'undefined',
        ", sessionId:", req.session?.id || 'undefined',
        ", cookieHeader:", !!req.headers.cookie,
        ", user:", req.session?.user ? `{id: ${req.session.user.id}, email: ${req.session.user.email}}` : 'undefined',
        "}");

      // Check if authenticated via anonymous token (iframe environment)
      if (req.anonymousUser) {
        debugLog("Returning anonymous token user:", req.anonymousUser.id);
        return res.json(req.anonymousUser);
      }

      // Check if it's an anonymous user via session (regular browser)
      if (getThorxPrincipalId(req) && getThorxPrincipalId(req)?.startsWith('anonymous_')) {
        debugLog("Returning anonymous session user:", getThorxPrincipalId(req));
        // Return the anonymous user data from session
        const anonymousUser = req.session.anonymousUserData || {
          id: getThorxPrincipalId(req),
          firstName: req.session.user!.firstName,
          lastName: req.session.user!.lastName,
          email: req.session.user!.email,
          identity: `GUEST_USER_${Math.floor(Math.random() * 9999) + 1000}`,
          phone: "",
          referralCode: `GUEST-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          totalEarnings: "0.00",
          availableBalance: "0.00",
          isActive: true,
          avatar: (req.session as any).anonymousUserData?.avatar || 'default',
          name: (req.session as any).anonymousUserData?.name || `${req.session.user!.firstName} ${req.session.user!.lastName || ""}`.trim(),
          createdAt: new Date().toISOString(),
        };

        return res.json(anonymousUser);
      }

      // Regular authenticated user — middleware guarantees principalId is set
      const principalId = getThorxPrincipalId(req)!;
      debugLog("Fetching user from database with userId:", principalId);
      const user = await storage.getUserById(principalId);

      if (!user) {
        debugLog("User not found in database for userId:", principalId);
        return res.status(404).json({
          message: "User not found",
          error: "USER_NOT_FOUND"
        });
      }

      // If team/admin/founder, get permissions from teamKeys and check if active
      let permissions: string[] = [];
      if (['team', 'admin', 'founder'].includes(user.role || '')) {
        const keys = await storage.getTeamKeysByUser(user.id);
        if (keys && keys.length > 0) {
          const activeKey = keys[0];
          
          // HARD LOCKOUT if the key is suspended
          if (!activeKey.isActive && user.role !== 'founder') {
            return new Promise<void>((resolve) => {
              req.session.destroy((err) => {
                if (err) logger.error({ err: err }, "Error destroying session:");
                res.status(401).json({
                  message: "Account suspended: Your cryptographic key has been revoked or frozen.",
                  error: "UNAUTHORIZED"
                });
                resolve();
              });
            });
          }
          
          permissions = activeKey.permissions || [];
        } else if (user.role !== 'founder') {
          // If marked as team but has no key, kick them out
          return new Promise<void>((resolve) => {
            req.session.destroy((err) => {
              res.status(401).json({
                message: "Authentication failure: Missing required cryptographic key.",
                error: "UNAUTHORIZED"
              });
              resolve();
            });
          });
        }
      }

      debugLog("User found, returning user data for:", user.email, "Avatar:", user.avatar);
      res.json({
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        identity: user.identity,
        phone: user.phone,
        referralCode: user.referralCode,
        totalEarnings: user.totalEarnings,
        availableBalance: user.availableBalance,
        isActive: user.isActive,
        createdAt: user.createdAt,
        role: user.role || 'user',
        permissions: permissions,
        avatar: user.avatar || 'default',
        profilePicture: user.profilePicture,
        name: `${user.firstName} ${user.lastName || ""}`.trim(),
        // THORX v3 fields
        userRankTier: user.userRankTier || 'E-Rank',
        guildRole: user.guildRole || 'simple',
        guildId: user.guildId || null,
        performanceScore: user.performanceScore ?? 0,
        streakDays: user.streakDays ?? 0,
        txPointsBalance: user.txPointsBalance ?? 0,
        lastActiveAt: user.lastActiveAt,
      });
    } catch (error) {
      logger.error({ err: error }, "Get user error:");
      res.status(500).json({
        message: "Failed to fetch user data",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Update own user profile
  app.patch("/api/users/:id", requireSessionAuth, profileRateLimiter, async (req, res) => {
    try {
      // requireSessionAuth already rejects unauthenticated and suspended users (Finding 1-E)
      const principalId = getThorxPrincipalId(req) as string;

      if (principalId !== req.params.id) {
        return res.status(403).json({ message: "Cannot update other users" });
      }

      const { name, avatar, profilePicture } = z.object({
        name: z.string().min(1).max(200).optional(),
        avatar: z.string().max(100).optional(),
        profilePicture: z.string().max(2_000_000).optional().nullable(),
      }).parse(req.body);
      const updates: any = {};

      if (name) {
        // Table schema uses firstName and lastName columns
        const parts = name.trim().split(' ');
        updates.firstName = parts[0];
        updates.lastName = parts.slice(1).join(' ') || '';
      }

      debugLog(`[PATCH] Updating user ${req.params.id}. Payload:`, { name, avatarLength: avatar?.length, hasProfilePicture: !!profilePicture });

      if (avatar) updates.avatar = avatar;

      let resolvedProfilePicture: string | null | undefined = undefined;
      if (Object.prototype.hasOwnProperty.call(req.body, "profilePicture")) {
        try {
          const prevPic =
            principalId.startsWith("anonymous_")
              ? req.session.anonymousUserData?.profilePicture
              : (await storage.getUserById(req.params.id))?.profilePicture;
          resolvedProfilePicture = await processProfilePicture(
            profilePicture as string | null | undefined,
          );
        } catch (picErr: unknown) {
          const msg = picErr instanceof Error ? picErr.message : "Invalid profile image";
          return res.status(400).json({ message: msg });
        }
      }
      if (resolvedProfilePicture !== undefined) {
        updates.profilePicture = resolvedProfilePicture;
      }

      // Handle Anonymous User Session Updates
      if (principalId.startsWith('anonymous_')) {
        debugLog(`[PATCH] Updating anonymous session user.`);
        req.session.anonymousUserData = {
          ...req.session.anonymousUserData!,
          ...updates,
          avatar: avatar || req.session.anonymousUserData?.avatar,
          profilePicture:
            resolvedProfilePicture !== undefined
              ? resolvedProfilePicture
              : req.session.anonymousUserData?.profilePicture,
          // ensure name split is reflected if name was updated
          firstName: updates.firstName || req.session.anonymousUserData?.firstName,
          lastName: updates.lastName || req.session.anonymousUserData?.lastName,
          name: name || req.session.anonymousUserData?.name || `${updates.firstName || req.session.anonymousUserData?.firstName} ${updates.lastName || req.session.anonymousUserData?.lastName || ""}`.trim()
        };

        // Force session save
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });

        debugLog(`[PATCH] Anonymous user updated. New avatar:`, req.session.anonymousUserData?.avatar);
        return res.json(req.session.anonymousUserData);
      }

      debugLog(`[PATCH] Updating persistent DB user...`);

      // Fetch "before" state for audit diff (non-anonymous path only)
      const beforeUser = await storage.getUserById(req.params.id);
      
      // Elite Validation Layer (Enterprise Standard)
      const updateData: any = {
        avatar: avatar || undefined,
        updatedAt: new Date()
      };
      if (name) {
        const parts = name.trim().split(' ');
        updateData.firstName = parts[0];
        updateData.lastName = parts.slice(1).join(' ');
      }
      if (resolvedProfilePicture !== undefined) {
        updateData.profilePicture = resolvedProfilePicture;
      }

      const user = await storage.updateUser(req.params.id, updateData);
      
      if (user) {
        (user as any).name = `${user.firstName} ${user.lastName || ""}`.trim();
        
        // Audit log for profile change — enriched with before/after diff
        try {
          const profilePictureChanged = resolvedProfilePicture !== undefined;
          const diff = diffFields(beforeUser, user, ["firstName", "lastName", "avatar"]);
          await storage.createAuditLog({
            adminId: principalId,
            actorRole: req.userProfile?.role,
            action: "UPDATE_PROFILE",
            targetType: "user",
            targetId: user.id,
            details: {
              fields: Object.keys(updateData).filter(k => updateData[k] !== undefined),
              diff,
              profilePictureChanged,
            },
          }, getRequestContext(req));
        } catch (auditErr) {
          logger.error({ err: auditErr }, "UPDATE_PROFILE audit log failed (non-blocking):");
        }
      }
      
      debugLog(`[PATCH] DB Update Result:`, { id: user?.id, newAvatar: user?.avatar });
      res.json(user ? sanitizeUser(user) : null);
    } catch (error) {
      logger.error({ err: error }, "Update profile error:");
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Get user notifications (financial alerts from admins)
  app.get("/api/notifications", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const userNotifications = await storage.getUserNotifications(thorxPid);
      res.json(userNotifications);
    } catch (error) {
      logger.error({ err: error }, "Get notifications error:");
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  // Clear all notifications for the authenticated user
  app.delete("/api/notifications", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      await storage.clearAllNotifications(thorxPid);
      res.json({ message: "All notifications cleared." });
    } catch (error) {
      logger.error({ err: error }, "Clear notifications error:");
      res.status(500).json({ message: "Failed to clear notifications" });
    }
  });

  // Get user earnings endpoint
  app.get("/api/earnings", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const earnings = await storage.getUserEarnings(thorxPid, limit);

      res.json({
        earnings,
        total: await storage.getUserTotalEarnings(thorxPid)
      });
    } catch (error) {
      logger.error({ err: error }, "Get earnings error:");
      res.status(500).json({
        message: "Failed to fetch earnings",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get user referrals endpoint
  app.get("/api/referrals", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const referrals = await storage.getUserReferrals(thorxPid);
      const stats = await storage.getReferralStats(thorxPid);

      const user = await storage.getUserById(thorxPid);
      res.json({
        referralCode: user?.referralCode ?? null,
        referrals,
        stats
      });
    } catch (error) {
      logger.error({ err: error }, "Get referrals error:");
      res.status(500).json({
        message: "Failed to fetch referrals",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get commissions endpoint
  app.get("/api/commissions", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const commissions = await storage.getCommissionLogsByBeneficiary(thorxPid);
      res.json({ commissions });
    } catch (error) {
      logger.error({ err: error }, "Get commissions error:");
      res.status(500).json({ message: "Failed to fetch commissions" });
    }
  });

  app.get("/api/team/users", requirePermission("VIEW_USERS"), async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 8;
      const search = req.query.search as string;
      const sort = req.query.sort as string;
      const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';
      const role = 'user'; // Filter to only show Users, not founders/team members

      const result = await storage.getUsersPaginated({ page, limit, search, sort, sortOrder, role });
      // C-01: passwordHash must never be exposed to team portal clients regardless of trust level.
      const sanitized = {
        ...result,
        users: result.users.map(({ passwordHash: _ph, ...safe }: any) => safe),
      };
      res.json(sanitized);
    } catch (error) {
      logger.error({ err: error }, "Fetch users error:");
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // ── Withdrawal timeframe breakdown (Spec §4.1) ────────────────────────────────
  // Returns how many TX-Points (and equivalent PKR) the user has earned in each
  // time bucket — used by the withdrawal timeframe selector UI. Never exposes PKR
  // until the user reaches the summary screen.
  app.get("/api/withdrawals/timeframe-breakdown", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const breakdown = await storage.getWithdrawalTimeframeBreakdowns(userId);
      res.json(breakdown);
    } catch (error) {
      logger.error({ err: error }, "Timeframe breakdown error:");
      res.status(500).json({ message: "Failed to fetch timeframe breakdown" });
    }
  });

  // High-severity finding (2026-07-15 audit): these two routes used getThorxPrincipalId
  // directly, bypassing requireSessionAuth's team-key suspension enforcement — a suspended
  // account could still read/create withdrawals. requireSessionAuth + withdrawalRateLimiter
  // added to both.
  app.get("/api/withdrawals", requireSessionAuth, withdrawalRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req);
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      // Payout access always open — no task gate (Blueprint v2026)
      const userWithdrawals = await storage.getWithdrawalsByUserId(userId);
      res.json(userWithdrawals);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch withdrawals" });
    }
  });

  // Request Payout endpoint
  app.post("/api/withdrawals", requireSessionAuth, withdrawalRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      // H-01: Idempotency key deduplication — client sends X-Idempotency-Key UUID
      // generated fresh for each new withdrawal attempt and stable through retries.
      const idempotencyKey = req.headers["x-idempotency-key"] as string | undefined;
      if (idempotencyKey) {
        const cached = _withdrawalIdempCache.get(`${userId}:${idempotencyKey}`);
        if (cached && cached.expiresAt > Date.now()) {
          logger.info({ userId, idempotencyKey }, "[Withdrawals] Idempotency hit — returning cached response");
          return res.status(cached.status).json(cached.body);
        }
      }

      // Payout always open — minimum balance enforced in storage layer (Blueprint v2026)
      // Explicitly pick only the user-supplied fields — never spread req.body directly
      // so an attacker who adds `status: "approved"` or `fee: "0"` to the payload
      // cannot smuggle those fields past Zod (the schema already omits them, but
      // the explicit pick makes the intent clear and safe against future schema drift —
      // audit finding O).
      const withdrawalData = insertWithdrawalSchema.parse({
        amount:         req.body.amount,
        method:         req.body.method,
        accountName:    req.body.accountName,
        accountNumber:  req.body.accountNumber,
        accountDetails: req.body.accountDetails ?? {},
        userId,
      });

      const withdrawal = await storage.createWithdrawal(withdrawalData);

      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "WITHDRAWAL_REQUESTED",
          targetType: "user",
          targetId: userId,
          details: { amount: withdrawalData.amount, method: withdrawalData.method, withdrawalId: withdrawal.id },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (WITHDRAWAL_REQUESTED):");
      }

      const responseBody = { success: true, withdrawal, message: "Withdrawal request submitted successfully" };
      // H-01: Cache the successful response so retried requests with the same key
      // return the same 201 without creating a duplicate withdrawal.
      if (idempotencyKey) {
        _withdrawalIdempCache.set(`${userId}:${idempotencyKey}`, {
          status: 201,
          body: responseBody,
          expiresAt: Date.now() + 60_000,
        });
      }
      res.status(201).json(responseBody);
    } catch (error) {
      logger.error({ err: error }, "Create withdrawal error");
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      // Business logic errors from storage layer
      if (error instanceof Error && (
        error.message.includes("balance") || 
        error.message.includes("withdrawal amount") || 
        error.message.includes("already exists")
      )) {
        return res.status(400).json({ message: error.message });
      }
      // M-11: Capture unexpected failures in Sentry for financial routes
      Sentry.captureException(error);
      res.status(500).json({ message: "Failed to submit withdrawal request" });
    }
  });

  // ── Guild Vault & Points Ledger: user-facing guild routes ──────────────────
  app.get("/api/guilds", requireSessionAuth, async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const result = await storage.listGuilds({ search, limit, offset });
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "List guilds error:");
      res.status(500).json({ message: "Failed to fetch guilds" });
    }
  });

  app.get("/api/guilds/mine", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const membership = await storage.getUserGuildMembership(userId);
      // getUserGuildMembership already embeds the joined guild row — expose it at
      // the top level as well (`guild`) for callers that want the guild directly
      // without unwrapping `membership.guild`.
      res.json({ membership: membership ?? null, guild: membership?.guild ?? null });
    } catch (error) {
      logger.error({ err: error }, "Get my guild membership error:");
      res.status(500).json({ message: "Failed to fetch guild membership" });
    }
  });

  // ── Guild creation requires B-Rank minimum (beta policy) ─────────────────
  // Engines A (ads), B (surveys) and C (guilds/wars) are open to every rank
  // during beta; only CREATING a guild demands B-Rank.
  const GUILD_CREATION_MIN_RANK = "B-Rank";
  const RANK_ORDER_FOR_GUILD = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
  const meetsGuildCreationRank = async (userId: string): Promise<boolean> => {
    const u = await storage.getUserById(userId);
    const ui = RANK_ORDER_FOR_GUILD.indexOf(u?.userRankTier || "E-Rank");
    return ui >= RANK_ORDER_FOR_GUILD.indexOf(GUILD_CREATION_MIN_RANK);
  };

  app.post("/api/guilds", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const createGuildSchema = z.object({
        name:        z.string().trim().min(3, "Guild name must be at least 3 characters.").max(60, "Guild name cannot exceed 60 characters."),
        description: z.string().trim().max(500, "Description cannot exceed 500 characters.").optional(),
      });
      const parsed = createGuildSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid guild data" });
      const { name, description } = parsed.data;
      // Beta policy: guild creation requires B-Rank on BOTH paths (legacy direct
      // and the admin-approved creation-request flow below).
      if (!(await meetsGuildCreationRank(userId))) {
        return res.status(403).json({ error: "RANK_GATE", requiredRank: GUILD_CREATION_MIN_RANK, message: `Creating a guild requires ${GUILD_CREATION_MIN_RANK} or higher.` });
      }
      const guild = await storage.createGuild({ name, description, captainId: userId });
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_CREATED",
          targetType: "guild",
          targetId: guild.id,
          details: { name: guild.name },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_CREATED):");
      }
      res.status(201).json({ guild });
    } catch (error) {
      logger.error({ err: error }, "Create guild error:");
      const message = error instanceof Error ? error.message : "Failed to create guild";
      res.status(400).json({ message });
    }
  });

  // ── THORX v3 (spec E.9): Guild Discovery — must be defined BEFORE /api/guilds/:id ──
  app.get("/api/guilds/discovery", requireSessionAuth, async (req, res) => {
    try {
      const { fetchGpsConfig, computeGuildRankTier } = await import("./modules/gps-engine");
      const [guilds, config] = await Promise.all([
        storage.getGuildDiscoveryList(),
        fetchGpsConfig(),
      ]);
      res.json({
        guilds: guilds.map((g: any) => ({
          ...g,
          rankTier: computeGuildRankTier(g.guildPerformanceScore, config.rankMins),
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild discovery list" });
    }
  });

  // ── Engine C: Weekly Tasks ────────────────────────────────────────────────────
  // IMPORTANT: registered BEFORE /api/guilds/:id — Express matches the literal
  // "weekly-tasks" segment first, otherwise it is captured as `:id` and the
  // route 404s as "Guild not found".
  app.get("/api/guilds/weekly-tasks", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const membership = await storage.getUserGuildMembership(userId);
      if (!membership || membership.status !== "active") {
        return res.status(403).json({ message: "Weekly tasks are only available to active guild members." });
      }
      const tasks = await storage.getActiveWeeklyTasks(userId, membership.guildId);

      // Strip `grossPkrPerCompletion` (raw PKR value) from the user-facing response —
      // it breaks the TX-Points-only illusion (audit finding B). Replace with a
      // pre-computed `txPointsReward` / `txPointsRewardMax` range so the frontend
      // never does PKR math client-side.
      // TX-Points for Engine C are based on the 80% pool contribution (not user cut,
      // which is now 0% — pool unlocks Sunday). This keeps gamification visible.
      const [conversionRate, poolPct] = await Promise.all([
        storage.getSystemConfigValue<number>("CONVERSION_RATE", 100),
        storage.getSystemConfigValue<number>("ENGINE_C_GUILD_POOL_PCT", 80),
      ]);
      const poolPctD = new Decimal(poolPct);

      const safeTasks = (tasks as any[]).map((task) => {
        const { grossPkrPerCompletion, ...rest } = task;
        const grossPkrD = new Decimal(grossPkrPerCompletion ?? "0");
        const isIndirect = task.taskCategory === "indirect" || grossPkrD.isZero();
        const txPointsReward = isIndirect
          ? 0
          : grossPkrD.times(poolPctD).div(100).times(conversionRate)
              .toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber();
        const txPointsRewardMax = txPointsReward
          ? new Decimal(txPointsReward).times(1.2).toDecimalPlaces(0, Decimal.ROUND_FLOOR).toNumber()
          : 0;
        return { ...rest, txPointsReward, txPointsRewardMax };
      });

      res.json({ tasks: safeTasks });
    } catch (error) {
      logger.error({ err: error }, "Get weekly tasks error:");
      res.status(500).json({ message: "Failed to fetch weekly tasks" });
    }
  });

  app.get("/api/guilds/:id", requireSessionAuth, async (req, res) => {
    try {
      const guild = await storage.getGuildById(req.params.id);
      if (!guild) return res.status(404).json({ message: "Guild not found" });
      const members = await storage.getGuildMembers(req.params.id);
      res.json({ guild, members });
    } catch (error) {
      logger.error({ err: error }, "Get guild error:");
      res.status(500).json({ message: "Failed to fetch guild" });
    }
  });


  // THORX v3 (spec K.3 Phase 6): legacy join/approve/reject routes retired —
  // superseded by POST /api/guilds/:id/apply + PATCH /api/guilds/:id/applications/:applicationId.
  // No client code calls these anymore; kept as 410 stubs in case of stale clients.
  app.post("/api/guilds/:id/join", requireSessionAuth, async (_req, res) => {
    res.status(410).json({ message: "Use POST /api/guilds/:id/apply instead.", error: "ENDPOINT_RETIRED" });
  });

  app.post("/api/guilds/:id/members/:userId/approve", requireSessionAuth, async (_req, res) => {
    res.status(410).json({ message: "Use PATCH /api/guilds/:id/applications/:applicationId instead.", error: "ENDPOINT_RETIRED" });
  });

  app.post("/api/guilds/:id/members/:userId/reject", requireSessionAuth, async (_req, res) => {
    res.status(410).json({ message: "Use PATCH /api/guilds/:id/applications/:applicationId instead.", error: "ENDPOINT_RETIRED" });
  });

  app.post("/api/guilds/:id/leave", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      await storage.leaveGuild(req.params.id, userId);
      // H-02: Broadcast to the leaving user and all guild members so UI
      // updates in real-time without requiring a page refresh.
      broadcastUserUpdated(userId, "guild_left");
      broadcastGuildEvent(req.params.id, 'guild.member_left', { userId, guildId: req.params.id });
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_LEFT",
          targetType: "guild",
          targetId: req.params.id,
          details: {},
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_LEFT):");
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Leave guild error:");
      const message = error instanceof Error ? error.message : "Failed to leave guild";
      res.status(400).json({ message });
    }
  });

  app.delete("/api/guilds/:id/members/:userId", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      await storage.removeGuildMember(req.params.id, req.params.userId, captainId);
      // H-02: Broadcast to the removed user so their portal reflects the change
      // immediately rather than waiting for a manual refresh.
      broadcastUserUpdated(req.params.userId, "guild_removed");
      broadcastGuildEvent(req.params.id, 'guild.member_removed', { userId: req.params.userId, guildId: req.params.id });
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_MEMBER_KICKED",
          targetType: "guild",
          targetId: req.params.id,
          details: { removedUserId: req.params.userId },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_MEMBER_KICKED):");
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Remove guild member error:");
      const message = error instanceof Error ? error.message : "Failed to remove member";
      res.status(400).json({ message });
    }
  });

  // ── Engine C: Guild Chat ─────────────────────────────────────────────────────
  app.get("/api/guilds/:id/chat", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const membership = await storage.getUserGuildMembership(userId);
      if (!membership || membership.guildId !== req.params.id || membership.status !== "active") {
        return res.status(403).json({ message: "You must be an active member of this guild to view chat." });
      }
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const before = req.query.before as string | undefined;
      const messages = await storage.getEngineCMessages(req.params.id, limit, before);
      // Surface a render-ready avatarUrl (universal avatar id → /avatars/*.png,
      // custom upload passed through) so chat bubbles show real profile pics.
      res.json({
        messages: messages.map((m: any) => ({
          ...m,
          avatarUrl: m.avatar
            ? (typeof m.avatar === "string" && m.avatar.startsWith("avatar-") ? `/avatars/${m.avatar}.png` : m.avatar)
            : null,
        })),
      });
    } catch (error) {
      logger.error({ err: error }, "Get guild chat error:");
      res.status(500).json({ message: "Failed to fetch chat messages" });
    }
  });

  app.post("/api/guilds/:id/chat", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const membership = await storage.getUserGuildMembership(userId);
      if (!membership || membership.guildId !== req.params.id || membership.status !== "active") {
        return res.status(403).json({ message: "You must be an active member of this guild to send messages." });
      }
      const { message } = req.body;
      if (!message || typeof message !== "string" || !message.trim() || message.length > 500) {
        return res.status(400).json({ message: "Message must be 1–500 characters." });
      }
      const saved = await storage.createEngineCMessage({ guildId: req.params.id, senderId: userId, message: message.trim() });
      broadcastGuildMessage(req.params.id, { type: "engine_c:message", payload: saved });
      res.status(201).json({ message: saved });
    } catch (error) {
      logger.error({ err: error }, "Send guild chat error:");
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // earnRateLimiter caps at 15 earn events/min per user — added per audit finding 1-E.
  // completeWeeklyTaskAtomic wraps the duplicate-check + insert + recordEarnEvent in a
  // single db.transaction() with a FOR UPDATE user lock (audit finding 1-D).
  app.post("/api/guilds/weekly-tasks/:taskId/complete", requireSessionAuth, earnRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const membership = await storage.getUserGuildMembership(userId);
      if (!membership || membership.status !== "active") {
        return res.status(403).json({ message: "Only active guild members can complete weekly tasks." });
      }
      if (!["member", "captain"].includes(membership.role)) {
        return res.status(403).json({ message: "Only members and captains can complete weekly tasks." });
      }
      // Single atomic call: duplicate-check + insert + recordEarnEvent inside one transaction.
      const { record, task, earnResult } = await storage.completeWeeklyTaskAtomic(
        userId,
        membership.guildId,
        req.params.taskId,
      );
      broadcastGuildEvent(membership.guildId, 'guild.weekly_points', {
        userId, guildId: membership.guildId, pointsCredited: earnResult?.pointsCredited ?? 0
      });
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_WEEKLY_TASK_COMPLETED",
          targetType: "guild",
          targetId: membership.guildId,
          details: { taskId: req.params.taskId, taskName: (task as any)?.title ?? (task as any)?.name, pointsCredited: earnResult?.pointsCredited ?? 0 },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_WEEKLY_TASK_COMPLETED):");
      }
      res.status(201).json({ record, earnResult });
    } catch (error) {
      logger.error({ err: error }, "Complete weekly task error:");
      const msg = error instanceof Error ? error.message : "Failed to complete task";
      res.status(400).json({ message: msg });
    }
  });

  // ── Engine C: Guild Settings (Captain only) ────────────────────────────────────
  const guildSettingsSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters").max(60).optional(),
    description: z.string().max(500).optional().nullable(),
    minRankRequired: z.string().optional(),
    recruitmentOpen: z.boolean().optional(),
    isPublic: z.boolean().optional(), // R-26: discoverable in guild search
    memberCapacity: z.number().int().min(10).max(50).optional(),
    pinnedMemberId: z.string().optional().nullable(),
    // Uploaded guild images are resized client-side but remain data URLs.
    avatarUrl: z.string().max(2_000_000).optional().nullable(),
  });

  app.patch("/api/guilds/:id/settings", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const parsed = guildSettingsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid settings.", errors: parsed.error.flatten().fieldErrors });
      }
      const { name, description, minRankRequired, recruitmentOpen, isPublic, pinnedMemberId, avatarUrl } = parsed.data;
      const beforeGuild = await storage.getGuildById(req.params.id);
      const guild = await storage.updateGuildSettings(req.params.id, userId, {
        name,
        description: description ?? undefined,
        minRankRequired,
        recruitmentOpen,
        isPublic,
        pinnedMemberId: pinnedMemberId ?? undefined,
        // Preserve an explicit null so the captain can remove the picture.
        avatarUrl: Object.prototype.hasOwnProperty.call(parsed.data, "avatarUrl")
          ? avatarUrl
          : undefined,
      });
      // Notify all guild members of settings change
      broadcastGuildEvent(req.params.id, 'guild.settings_updated', { guildId: req.params.id });
      try {
        const diff = diffFields(beforeGuild, guild, ["name", "description", "minRankRequired", "recruitmentOpen", "isPublic", "pinnedMemberId", "avatarUrl"]);
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_SETTINGS_UPDATED",
          targetType: "guild",
          targetId: req.params.id,
          details: { diff, updatedFields: Object.keys(parsed.data) },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_SETTINGS_UPDATED):");
      }
      res.json({ guild });
    } catch (error) {
      logger.error({ err: error }, "Update guild settings error:");
      const msg = error instanceof Error ? error.message : "Failed to update guild settings";
      res.status(400).json({ message: msg });
    }
  });

  // ── Captain: Post / Clear Announcement ───────────────────────────────────────
  app.post("/api/guilds/:id/announcement", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const { text } = z.object({ text: z.string().min(1).max(500) }).parse(req.body);
      const guild = await storage.postGuildAnnouncement(req.params.id, userId, text);
      // Broadcast to all guild members so they see the announcement instantly
      // without a manual refresh (audit finding X — was previously missing).
      broadcastGuildEvent(req.params.id, 'guild.announcement_posted', {
        guildId: req.params.id,
        announcement: text,
        postedAt: new Date().toISOString(),
      });
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_ANNOUNCEMENT_POSTED",
          targetType: "guild",
          targetId: req.params.id,
          details: { preview: text.length > 120 ? `${text.slice(0, 120)}…` : text },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_ANNOUNCEMENT_POSTED):");
      }
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to post announcement";
      res.status(400).json({ message: msg });
    }
  });

  app.delete("/api/guilds/:id/announcement", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const guild = await storage.clearGuildAnnouncement(req.params.id, userId);
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_ANNOUNCEMENT_DELETED",
          targetType: "guild",
          targetId: req.params.id,
          details: {},
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_ANNOUNCEMENT_DELETED):");
      }
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to clear announcement";
      res.status(400).json({ message: msg });
    }
  });

  // ── Engine C: MVP Pin ─────────────────────────────────────────────────────────
  app.post("/api/guilds/:id/pin/:memberId", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const unpinned = req.params.memberId === "unpin";
      const guild = await storage.updateGuildSettings(req.params.id, userId, {
        pinnedMemberId: unpinned ? null : req.params.memberId,
      });
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_MEMBER_PINNED",
          targetType: "guild",
          targetId: req.params.id,
          details: unpinned ? { unpinned: true } : { pinnedMemberId: req.params.memberId },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_MEMBER_PINNED):");
      }
      res.json({ guild });
    } catch (error) {
      logger.error({ err: error }, "Pin member error:");
      const msg = error instanceof Error ? error.message : "Failed to pin member";
      res.status(400).json({ message: msg });
    }
  });

  // ── Admin: Weekly Task Manager ────────────────────────────────────────────────
  app.get("/api/admin/weekly-tasks", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      const tasks = await storage.getAllWeeklyTasks();
      res.json({ tasks });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch weekly tasks" });
    }
  });

  const weeklyTaskCreateSchema = z.object({
    title:                  z.string().min(3).max(200),
    description:            z.string().max(1000).optional(),
    pointReward:            z.number().int().min(1).max(100000),
    weekStart:              z.string().datetime({ message: "weekStart must be an ISO datetime string" }),
    weekEnd:                z.string().datetime({ message: "weekEnd must be an ISO datetime string" }),
    targetGuildRank:        z.enum(["E", "D", "C", "B", "A", "S"]).optional().default("E"),
    isActive:               z.boolean().optional().default(true),
    grossPkrPerCompletion:  z.string().regex(/^\d+(\.\d+)?$/, "grossPkrPerCompletion must be a positive decimal string").optional(),
    taskCategory:           z.enum(["cpa_offer", "indirect", "platform"]).optional().default("cpa_offer"),
    actionUrl:              z.string().url().max(500).optional().nullable(),
  });

  app.post("/api/admin/weekly-tasks", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      const parsed = weeklyTaskCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Validation failed", error: "VALIDATION_ERROR" });
      }
      const { title, description, pointReward, weekStart, weekEnd, targetGuildRank, isActive, grossPkrPerCompletion, taskCategory, actionUrl } = parsed.data;
      const task = await storage.createWeeklyTask({
        title, description, pointReward,
        weekStart: new Date(weekStart), weekEnd: new Date(weekEnd),
        targetGuildRank,
        createdBy: req.userProfile.id,
        isActive,
        taskCategory,
        ...(actionUrl !== undefined ? { actionUrl } : {}),
        // Indirect tasks never carry real PKR — force to "0" regardless of what was sent
        ...(taskCategory === "indirect"
          ? { grossPkrPerCompletion: "0" }
          : grossPkrPerCompletion !== undefined ? { grossPkrPerCompletion } : {}),
      });
      res.status(201).json({ task });
    } catch (error) {
      logger.error({ err: error }, "Create weekly task error:");
      res.status(500).json({ message: "Failed to create weekly task" });
    }
  });

  const weeklyTaskUpdateSchema = z.object({
    title:                  z.string().min(1).max(200).optional(),
    description:            z.string().max(1000).optional().nullable(),
    pointReward:            z.number().int().min(1).optional(),
    isActive:               z.boolean().optional(),
    targetGuildRank:        z.enum(["E", "D", "C", "B", "A", "S"]).optional(),
    weekStart:              z.string().datetime({ message: "weekStart must be an ISO datetime string" }).optional(),
    weekEnd:                z.string().datetime({ message: "weekEnd must be an ISO datetime string" }).optional(),
    grossPkrPerCompletion:  z.string().regex(/^\d+(\.\d+)?$/, "grossPkrPerCompletion must be a positive decimal string").optional().nullable(),
    taskCategory:           z.enum(["cpa_offer", "indirect", "platform"]).optional(),
    actionUrl:              z.string().url().max(500).optional().nullable(),
  });

  app.patch("/api/admin/weekly-tasks/:id", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      const parsed = weeklyTaskUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Validation failed", error: "VALIDATION_ERROR" });
      }
      const { weekStart, weekEnd, taskCategory, ...rest } = parsed.data;
      const updates: Record<string, unknown> = { ...rest, ...(taskCategory !== undefined ? { taskCategory } : {}) };
      if (weekStart !== undefined) updates.weekStart = new Date(weekStart);
      if (weekEnd !== undefined) updates.weekEnd = new Date(weekEnd);
      // If switching to indirect, force grossPkr to 0
      if (taskCategory === "indirect") updates.grossPkrPerCompletion = "0";
      // Audit finding (Task & Ad Management, 2026-07-28): the schema allows an explicit
      // `null` for grossPkrPerCompletion. completeWeeklyTaskAtomic already falls back to
      // "0" for a null value, so this couldn't pay out an undefined amount, but a real
      // cpa_offer task silently going NULL for its PKR reward is a confusing admin state
      // to leave in the DB — normalize it to "0" instead unless it's becoming indirect.
      if (updates.grossPkrPerCompletion === null && taskCategory !== "indirect") updates.grossPkrPerCompletion = "0";
      const task = await storage.updateWeeklyTask(req.params.id, updates as any);
      res.json({ task });
    } catch (error) {
      logger.error({ err: error }, "Update weekly task error:");
      res.status(500).json({ message: "Failed to update weekly task" });
    }
  });

  app.delete("/api/admin/weekly-tasks/:id", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      await storage.deleteWeeklyTask(req.params.id);
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: error }, "Delete weekly task error:");
      res.status(500).json({ message: "Failed to delete weekly task" });
    }
  });

  // ── Admin: Engine C Chat Moderation ───────────────────────────────────────────
  app.get("/api/admin/guilds/:id/chat", requireTeamRole, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const messages = await storage.getEngineCMessages(req.params.id, limit);
      res.json({ messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch chat logs" });
    }
  });

  app.delete("/api/admin/guilds/:id/chat/:messageId", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      await storage.deleteEngineCMessage(req.params.messageId, req.params.id, adminId);
      // Push a live update to any member/captain currently viewing this guild's chat,
      // mirroring the same channel used for new messages (engine_c:message).
      broadcastGuildMessage(req.params.id, { type: "engine_c:message_deleted", messageId: req.params.messageId });
      res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete message";
      res.status(400).json({ message });
    }
  });

  // ── Admin: cross-guild pending applications queue — RETIRED ────────────────
  // Guild join requests are now decided exclusively by the guild's own captain via
  // PATCH /api/guilds/:guildId/applications/:applicationId. Admins no longer get a
  // parallel accept/reject path so a captain's recruitment decisions can't be
  // bypassed from the team portal. Kept as 410 stubs in case of stale clients.
  app.get("/api/admin/guild-applications", requireTeamRole, async (_req, res) => {
    res.status(410).json({ message: "Guild join requests are decided by the guild captain only.", error: "ENDPOINT_RETIRED" });
  });

  app.post("/api/admin/guild-applications/:id/decide", requireTeamRole, adminActionRateLimiter, async (_req, res) => {
    res.status(410).json({ message: "Guild join requests are decided by the guild captain only.", error: "ENDPOINT_RETIRED" });
  });

  // Points ledger — user's own earn/release history (feeds Scratch Card + Ledger view)
  app.get("/api/points-ledger/me", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const result = await storage.getPointsLedgerForUser(userId, limit, offset);
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Get points ledger error:");
      res.status(500).json({ message: "Failed to fetch points ledger" });
    }
  });

  // ── Admin/team guild moderation ─────────────────────────────────────────────
  app.get("/api/admin/guilds", requireTeamRole, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
      const result = await storage.listGuildsAdmin({ status, search, limit, offset });
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Admin list guilds error:");
      res.status(500).json({ message: "Failed to fetch guilds" });
    }
  });

  // ── THORX v3 (spec E.9): Admin guild routes with literal paths — MUST be defined
  // BEFORE the parameterized /api/admin/guilds/:id/* routes to avoid Express conflicts.
  app.get("/api/admin/guilds/inactive-captains", requireTeamRole, async (req, res) => {
    try {
      const inactiveDays = req.query.days ? parseInt(req.query.days as string) : 3;
      const captains = await storage.adminGetInactiveCaptains(inactiveDays);
      res.json({ captains });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch inactive captains" });
    }
  });

  // Dormant Guild Watchlist — active guilds where every member has gone quiet,
  // not just the captain (see adminGetInactiveCaptains above for that narrower signal).
  app.get("/api/admin/guilds/dormant", requireTeamRole, async (req, res) => {
    try {
      const inactiveDays = req.query.days ? parseInt(req.query.days as string) : 7;
      const guilds = await storage.adminGetDormantGuilds(Number.isFinite(inactiveDays) && inactiveDays > 0 ? inactiveDays : 7);
      res.json({ guilds });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch dormant guilds" });
    }
  });

  // Ecosystem-wide KPI header for the admin Guild Manager (counts by status,
  // aggregate weekly pool, average GPS, pending creation requests).
  app.get("/api/admin/guilds/stats", requireTeamRole, async (req, res) => {
    try {
      const [guildStats, [{ count: pendingCreationRequests }]] = await Promise.all([
        storage.getGuildEcosystemStats(),
        db.select({ count: sql<number>`count(*)` }).from(guildCreationRequests).where(eq(guildCreationRequests.status, "pending")),
      ]);
      res.json({ ...guildStats, pendingCreationRequests: Number(pendingCreationRequests) });
    } catch (error) {
      logger.error({ err: error }, "Guild ecosystem stats error:");
      res.status(500).json({ message: "Failed to fetch guild stats" });
    }
  });

  app.post("/api/admin/guilds/bulk-targets", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const bulkTargetsSchema = z.object({
        targets: z.record(z.string(), z.number().finite().positive()).refine(
          obj => Object.keys(obj).length > 0,
          { message: "At least one rank target must be provided." }
        ),
      });
      const parsed = bulkTargetsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input", errors: parsed.error.flatten() });
      const updatedCounts = await storage.adminBulkSetWeeklyTargetsByRank(parsed.data.targets as any, adminId);
      res.json({ updatedCounts, updated: Object.values(updatedCounts).reduce((a, b) => a + b, 0) });
    } catch (error) {
      logger.error({ err: error }, "Bulk set weekly targets error:");
      const msg = error instanceof Error ? error.message : "Failed to bulk set targets";
      res.status(400).json({ message: msg });
    }
  });

  const bulkGuildIdsSchema = z.object({
    guildIds: z.array(z.string().uuid()).min(1, "Select at least one guild.").max(200),
  });

  app.post("/api/admin/guilds/bulk-status", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const parsed = bulkGuildIdsSchema.extend({
        status: z.enum(["active", "frozen", "disbanded"], { errorMap: () => ({ message: "status must be one of: active, frozen, disbanded" }) }),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { updated, failed } = await storage.adminBulkSetGuildStatus(parsed.data.guildIds, parsed.data.status, adminId);
      const failedIds = new Set(failed.map(f => f.guildId));
      for (const guildId of parsed.data.guildIds) {
        if (!failedIds.has(guildId)) broadcastGuildEvent(guildId, 'guild.status_changed', { guildId, status: parsed.data.status });
      }
      res.json({ updated, failed });
    } catch (error) {
      logger.error({ err: error }, "Bulk set guild status error:");
      const msg = error instanceof Error ? error.message : "Failed to bulk update guild status";
      res.status(400).json({ message: msg });
    }
  });

  app.post("/api/admin/guilds/bulk-message", requireTeamRole, adminActionRateLimiter, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const parsed = bulkGuildIdsSchema.extend({
        message: z.string().min(1, "Message cannot be empty.").max(1000),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const notifiedUserIds = await storage.adminBulkMessageGuilds(parsed.data.guildIds, parsed.data.message.trim(), adminId);
      for (const userId of notifiedUserIds) {
        broadcastToUser(userId, 'notification.created', { title: "Message from Guild Admin" });
      }
      res.json({ notified: notifiedUserIds.length });
    } catch (error) {
      logger.error({ err: error }, "Bulk message guilds error:");
      const msg = error instanceof Error ? error.message : "Failed to send bulk message";
      res.status(400).json({ message: msg });
    }
  });

  // ── Admin: CSV export for the guild directory — small in-memory CSV (guild
  // counts are orders of magnitude smaller than the user base) mirroring the
  // exact header/quoting/audit pattern used by the users and audit-log exports.
  app.get("/api/admin/guilds/export", requireTeamRole, async (req, res) => {
    try {
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const ids = req.query.ids ? (req.query.ids as string).split(",") : undefined;
      const adminId = getThorxPrincipalId(req) as string;

      const { guilds: allGuilds } = await storage.listGuildsAdmin({ status, search, limit: 100000 });
      const rows = ids && ids.length > 0 ? allGuilds.filter(g => ids.includes(g.id)) : allGuilds;

      const headers = ["ID", "Name", "Status", "Guild Rank", "GPS", "Members", "Capacity", "Weekly Points", "Weekly Target", "Weekly Bonus Pool (PKR)", "Bonus Pool (PKR)", "Strikes", "Target Difficulty", "Recruitment", "Created At"];
      const csvRows = rows.map(g => [
        g.id, g.name, g.status, g.guildRank, g.guildPerformanceScore,
        g.memberCount, g.memberCapacity, g.currentWeeklyPoints, g.weeklyTarget,
        g.weeklyBonusPool, g.bonusPoolPkr, g.strikes, g.targetDifficulty,
        g.recruitmentOpen ? "Open" : "Closed",
        new Date(g.createdAt ?? new Date()).toISOString(),
      ]);
      const csvContent = [
        headers.join(","),
        ...csvRows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      const filename = ids ? "THORX-Selected-Guilds" : "THORX-Guild-Directory";
      res.setHeader("Content-Disposition", `attachment; filename=${filename}-${new Date().toISOString().split('T')[0]}.csv`);

      await storage.createAuditLog({
        adminId,
        actorRole: req.userProfile?.role,
        action: "GUILD_DIRECTORY_EXPORTED",
        targetType: "system",
        targetId: ids ? "selected_guilds" : "guild_directory",
        details: { count: rows.length, status: status ?? null, search: search ?? null, ids: ids ?? null },
      }, getRequestContext(req));

      res.send(csvContent);
    } catch (error) {
      logger.error({ err: error }, "Guild export error:");
      res.status(500).json({ message: "Failed to export guilds" });
    }
  });

  // ── Admin: Ledger validation (scan before :userId to avoid Express conflict) ──
  // R-Audit (2026-07-29): gated by VIEW_FINANCE (was the generic requireTeamRole,
  // which let any team member see every user's balance/discrepancy data
  // regardless of finance access) + rate-limited like other heavy/sensitive
  // admin reads, and now leaves an audit trail like comparable financial routes.
  app.get("/api/admin/ledger/validate/scan", requirePermission("VIEW_FINANCE"), adminActionRateLimiter, async (req, res) => {
    try {
      // Default batch is 1000; the response's totalEligible tells the caller
      // whether more active users remain so the UI can page through offsets
      // instead of silently reporting a partial scan as complete.
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 1000;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const result = await storage.adminValidateLedgerScan(limit, offset);
      const adminId = req.userProfile?.id;
      if (adminId) {
        await storage.createAuditLog({
          adminId,
          actorRole: req.userProfile?.role,
          action: "LEDGER_SCAN",
          targetType: "system",
          targetId: "ledger",
          details: { limit, offset, scanned: result.scanned, flagged: result.flagged },
        }, getRequestContext(req));
      }
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Ledger scan error:");
      res.status(500).json({ message: "Ledger scan failed" });
    }
  });

  app.get("/api/admin/ledger/validate/:userId", requirePermission("VIEW_FINANCE"), adminActionRateLimiter, async (req, res) => {
    try {
      const result = await storage.adminValidateLedger(req.params.userId);
      const adminId = req.userProfile?.id;
      if (adminId) {
        await storage.createAuditLog({
          adminId,
          actorRole: req.userProfile?.role,
          action: "LEDGER_VALIDATE_USER",
          targetType: "user",
          targetId: result.userId,
          details: { email: result.email, isBalanced: result.isBalanced, discrepancy: result.discrepancy },
        }, getRequestContext(req));
      }
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Ledger validation failed";
      logger.error({ err: error }, "Ledger validation error:");
      res.status(400).json({ message: msg });
    }
  });

  // Ledger audit trail for a single user — surfaces past LEDGER_RECONCILE and
  // BALANCE_ADJUST_* actions so an admin can see whether/why an account was
  // previously corrected before deciding to reconcile it again (continuation
  // of the 2026-07-29 ledger audit — LedgerValidator.tsx previously had no
  // visibility into this history at all).
  app.get("/api/admin/ledger/audit-trail/:userId", requirePermission("VIEW_FINANCE"), adminActionRateLimiter, async (req, res) => {
    try {
      const { userId } = req.params;
      const trail = await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          metadata: auditLogs.details,
          createdAt: auditLogs.createdAt,
          adminFirstName: users.firstName,
          adminLastName: users.lastName,
          adminEmail: users.email,
        })
        .from(auditLogs)
        .innerJoin(users, eq(auditLogs.adminId, users.id))
        .where(
          and(
            eq(auditLogs.targetType, "user"),
            eq(auditLogs.targetId, userId),
            inArray(auditLogs.action, ["LEDGER_RECONCILE", "BALANCE_ADJUST_ADD", "BALANCE_ADJUST_SUBTRACT"]),
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(25);
      res.json({ trail });
    } catch (error) {
      logger.error({ err: error }, "Fetch ledger audit trail error:");
      res.status(500).json({ message: "Failed to fetch ledger audit trail" });
    }
  });

  // Reconcile a single user's stored balance/TX-Points counter back to what the
  // ledger actually computes. Always re-validates server-side immediately before
  // applying the correction (never trusts a client-supplied discrepancy, which
  // could be stale by the time the admin clicks the button), reuses the same
  // adjustUserBalance engine as the manual balance-adjustment tool, and requires
  // a reason + leaves its own audit trail. Gated by MANAGE_USERS — the same
  // permission already required to hand-adjust a balance, since reconciliation
  // is just a computed-amount balance adjustment.
  app.post("/api/admin/ledger/reconcile/:userId", requirePermission("MANAGE_USERS"), withdrawalRateLimiter, async (req, res) => {
    try {
      const { userId } = req.params;
      const reasonSchema = z.object({ reason: z.string().min(5).max(500) });
      const parsed = reasonSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "A reason (min 5 characters) is required." });
      }
      const { reason } = parsed.data;
      const adminId = req.userProfile!.id;

      const before = await storage.adminValidateLedger(userId);
      if (before.isBalanced) {
        return res.status(400).json({ message: "This account is already balanced — nothing to reconcile." });
      }

      const pkrDiscrepancyD = new Decimal(before.discrepancy || "0"); // stored - computed
      const pointsMismatch = before.pointsMismatch ?? 0; // stored - computed
      let user;
      if (!pkrDiscrepancyD.isZero() && pointsMismatch !== 0) {
        user = await storage.adjustUserBalance(
          userId,
          pkrDiscrepancyD.abs().toFixed(4),
          pkrDiscrepancyD.isPositive() ? "subtract" : "add",
          adminId,
          `Ledger reconciliation: ${reason}`,
          "admin_credit",
          -pointsMismatch,
          getRequestContext(req),
        );
      } else if (!pkrDiscrepancyD.isZero()) {
        user = await storage.adjustUserBalance(
          userId,
          pkrDiscrepancyD.abs().toFixed(4),
          pkrDiscrepancyD.isPositive() ? "subtract" : "add",
          adminId,
          `Ledger reconciliation: ${reason}`,
          undefined,
          undefined,
          getRequestContext(req),
        );
      } else if (pointsMismatch !== 0) {
        user = await storage.adjustUserBalance(
          userId,
          "0",
          "add",
          adminId,
          `Ledger reconciliation: ${reason}`,
          "admin_credit",
          -pointsMismatch,
          getRequestContext(req),
        );
      } else {
        // isBalanced was false (e.g. a negative-balance integrity error) but
        // there's no PKR/points delta to apply — not something this action can fix.
        return res.status(400).json({ message: "This account has a flagged issue that isn't a balance/points mismatch and can't be auto-reconciled." });
      }

      await storage.createAuditLog({
        adminId,
        actorRole: req.userProfile?.role,
        action: "LEDGER_RECONCILE",
        targetType: "user",
        targetId: userId,
        details: {
          email: before.email,
          reason,
          pkrDiscrepancyCorrected: pkrDiscrepancyD.toFixed(4),
          pointsMismatchCorrected: pointsMismatch,
          storedBalanceBefore: before.storedBalance,
          computedBalance: before.computedBalance,
        },
      }, getRequestContext(req));

      broadcastUserUpdated(userId, "balance_adjusted");
      const after = await storage.adminValidateLedger(userId);
      res.json({ user: sanitizeUser(user), validation: after });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Ledger reconciliation failed";
      logger.error({ err: error }, "Ledger reconciliation error:");
      res.status(400).json({ message: msg });
    }
  });

  const adminGuildStatusSchema = z.object({
    status: z.enum(["active", "frozen", "disbanded"], {
      errorMap: () => ({ message: "status must be one of: active, frozen, disbanded" }),
    }),
  });

  app.post("/api/admin/guilds/:id/status", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const parsed = adminGuildStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid status." });
      }
      const guild = await storage.setGuildStatus(req.params.id, parsed.data.status, adminId);
      // H-02: Broadcast status change so all guild members' portals update in real-time
      // (critical for 'disbanded' — members must be evicted from the guild UI immediately).
      broadcastGuildEvent(req.params.id, 'guild.status_changed', { guildId: req.params.id, status: parsed.data.status });
      res.json({ guild });
    } catch (error) {
      logger.error({ err: error }, "Admin set guild status error:");
      const message = error instanceof Error ? error.message : "Failed to update guild status";
      res.status(400).json({ message });
    }
  });

  const adminGuildStrikeSchema = z.object({
    reason: z.string().min(5, "Reason must be at least 5 characters.").max(1000),
  });

  app.post("/api/admin/guilds/:id/strikes", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const parsed = adminGuildStrikeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid request." });
      }
      const result = await storage.addManualGuildStrike(req.params.id, parsed.data.reason.trim(), adminId);
      broadcastGuildEvent(req.params.id, 'guild.strike_issued', { guildId: req.params.id, reason: parsed.data.reason.trim() });
      res.status(201).json(result);
    } catch (error) {
      logger.error({ err: error }, "Admin add guild strike error:");
      res.status(500).json({ message: "Failed to add guild strike" });
    }
  });

  app.post("/api/admin/guilds/:id/strikes/clear", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const guild = await storage.clearGuildStrikes(req.params.id, adminId);
      broadcastGuildEvent(req.params.id, 'guild.strikes_cleared', { guildId: req.params.id });
      res.json({ guild });
    } catch (error) {
      logger.error({ err: error }, "Admin clear guild strikes error:");
      res.status(500).json({ message: "Failed to clear guild strikes" });
    }
  });

  // Full strike audit trail (reason/source/who/when/cleared) — previously only
  // the live aggregate count was visible to admins with no way to see history.
  app.get("/api/admin/guilds/:id/strikes", requireTeamRole, async (req, res) => {
    try {
      const strikes = await storage.getGuildStrikeHistory(req.params.id);
      res.json({ strikes });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch strike history" });
    }
  });

  // Per-guild strike history export — tiny dataset (one guild), same in-memory CSV pattern.
  app.get("/api/admin/guilds/:id/strikes/export", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const strikes = await storage.getGuildStrikeHistory(req.params.id);

      const headers = ["ID", "Reason", "Source", "Added By", "Created At", "Status", "Cleared By", "Cleared At"];
      const csvRows = strikes.map(s => [
        s.id, s.reason, s.source, s.addedByName ?? "Unknown",
        new Date(s.createdAt ?? new Date()).toISOString(),
        s.clearedAt ? "Cleared" : "Active",
        s.clearedByName ?? "",
        s.clearedAt ? new Date(s.clearedAt).toISOString() : "",
      ]);
      const csvContent = [
        headers.join(","),
        ...csvRows.map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=THORX-Guild-Strikes-${req.params.id.slice(0, 8)}-${new Date().toISOString().split('T')[0]}.csv`);

      await storage.createAuditLog({
        adminId,
        actorRole: req.userProfile?.role,
        action: "GUILD_STRIKE_HISTORY_EXPORTED",
        targetType: "guild",
        targetId: req.params.id,
        details: { count: strikes.length },
      }, getRequestContext(req));

      res.send(csvContent);
    } catch (error) {
      logger.error({ err: error }, "Guild strike history export error:");
      res.status(500).json({ message: "Failed to export strike history" });
    }
  });

  // Guild-scoped activity/audit log — reuses the same paginated audit query as
  // the system-wide Audit Log Viewer, scoped via targetType/targetId, so every
  // existing GUILD_* audit action (status, strikes, GPS, captain, chat moderation,
  // creation approval) surfaces here automatically with zero duplicated logic.
  app.get("/api/admin/guilds/:id/audit-log", requireTeamRole, async (req, res) => {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
      const result = await storage.getAuditLogsPaginated({ page, limit, targetType: "guild", targetId: req.params.id });
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Guild activity log fetch error:");
      res.status(500).json({ message: "Failed to fetch guild activity log" });
    }
  });

  // Admin-scoped member kick — distinct from the captain-scoped
  // DELETE /api/guilds/:id/members/:userId, which hard-requires the caller to
  // be that guild's captain and has no admin override.
  app.delete("/api/admin/guilds/:id/members/:userId", requireTeamRole, adminActionRateLimiter, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      await storage.adminRemoveGuildMember(req.params.id, req.params.userId, adminId);
      broadcastUserUpdated(req.params.userId, "guild_removed");
      broadcastGuildEvent(req.params.id, 'guild.member_removed', { userId: req.params.userId, guildId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to remove member";
      res.status(400).json({ message: msg });
    }
  });

  // Admin: add a user directly to a guild roster — bypasses the
  // application/approval flow that regular users must go through.
  app.post("/api/admin/guilds/:id/members", requireTeamRole, adminActionRateLimiter, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "userId is required" });
      await storage.adminAddGuildMember(req.params.id, parsed.data.userId, adminId);
      broadcastUserUpdated(parsed.data.userId, "guild_joined");
      broadcastGuildEvent(req.params.id, 'guild.member_added', { userId: parsed.data.userId, guildId: req.params.id });
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add member";
      res.status(400).json({ message: msg });
    }
  });

  // Admin: appoint / remove a guild's assistant captain — same effect as the
  // captain-only routes further below, but callable by team/admin accounts.
  app.patch("/api/admin/guilds/:id/assistant-captain", requireTeamRole, adminActionRateLimiter, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const parsed = z.object({ memberId: z.string().min(1) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "memberId is required" });
      const guild = await storage.adminSetAssistantCaptain(req.params.id, parsed.data.memberId, adminId);
      broadcastToUser(parsed.data.memberId, 'guild.assistant_captain_appointed', { guildId: req.params.id });
      broadcastGuildEvent(req.params.id, 'guild.assistant_captain_changed', { assistantCaptainId: parsed.data.memberId });
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to set assistant captain";
      res.status(400).json({ message: msg });
    }
  });

  app.delete("/api/admin/guilds/:id/assistant-captain", requireTeamRole, adminActionRateLimiter, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const guild = await storage.adminRemoveAssistantCaptain(req.params.id, adminId);
      broadcastGuildEvent(req.params.id, 'guild.assistant_captain_changed', { assistantCaptainId: null });
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to remove assistant captain";
      res.status(400).json({ message: msg });
    }
  });

  // Admin-only per-guild target difficulty (low|medium|high) — schema/storage
  // already documented this as "admin-only, captains cannot change it" but no
  // route ever existed to actually set it.
  app.patch("/api/admin/guilds/:id/target-difficulty", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const parsed = z.object({ difficulty: z.enum(["low", "medium", "high"]) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "difficulty must be one of: low, medium, high" });
      const guild = await storage.adminSetGuildTargetDifficulty(req.params.id, parsed.data.difficulty, adminId);
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to set target difficulty";
      res.status(400).json({ message: msg });
    }
  });

  app.post("/api/admin/guild-cycles/run-resolution", requireTeamRole, async (req, res) => {
    try {
      const result = await runWeeklyGuildReset();
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Admin run guild resolution error:");
      res.status(500).json({ message: "Failed to run guild weekly resolution" });
    }
  });

  // Create ad view endpoint (no auth required)
  // POST /api/ad-view — requireSessionAuth ensures suspended accounts are blocked;
  // earnRateLimiter caps at 15/min per user.
  //
  // Race-condition fix: timing check + ad_view insert + earn event are all inside
  // a single db.transaction() with pg_advisory_xact_lock. Drizzle uses one DB
  // connection per transaction, so the xact-level advisory lock is guaranteed to be
  // on the same session as the INSERT — preventing concurrent submissions from the
  // same user from both passing the timing check before either row is committed.
  app.post("/api/ad-view", requireSessionAuth, earnRateLimiter, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;

      // R-17: Ad inventory is now runtime-configurable via system_config
      // (AD_INVENTORY_JSON key). getAdInventory() uses a 60-second TTL cache
      // so admins can update rewards/durations without a code deployment.
      const inventory = await getAdInventory();
      // Audit fix (Engine A hardening): MAX_ADS_PER_DAY existed but was only
      // used by the UI daily-goal display — the server never enforced it. The
      // cap is now checked inside the locked transaction (below).
      const dailyCap = await storage.getSystemConfigValue<number>("MAX_ADS_PER_DAY", 20);
      const { adId } = req.body;
      const adConfig = inventory[adId] || inventory["hilltop_fallback"];

      // Audit fix (Engine A hardening): an ad that does not exist in the
      // configured inventory is never credited. Previously any unknown adId
      // silently fell back to hilltop_fallback and paid the user from
      // THORX's own pocket — a loss a client could trigger with any id.
      if (!inventory[adId]) {
        return res.status(400).json({
          message: "This ad is not available right now.",
          error: "INVALID_AD",
        });
      }

      let adViewRow: any;
      let thorxCard: { pointsCredited: number; engineType: string } | null = null;
      let timingFailed = false;
      let dailyCapExceeded = false;

      try {
        await db.transaction(async (tx) => {
          // pg_advisory_xact_lock holds the lock on this connection for the entire
          // transaction — timing check, insert, and earn event are all protected.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${thorxPid})::bigint)`);

          // Verify the user actually waited long enough since their LAST ad view
          const lastViews = await tx
            .select({ createdAt: adViews.createdAt })
            .from(adViews)
            .where(eq(adViews.userId, thorxPid))
            .orderBy(desc(adViews.createdAt))
            .limit(1);

          if (lastViews.length > 0 && lastViews[0].createdAt) {
            const timeSinceLastAd = (Date.now() - new Date(lastViews[0].createdAt).getTime()) / 1000;
            // Enforce ad duration + 2 second buffer for network latency
            if (timeSinceLastAd < (adConfig.duration - 2)) {
              timingFailed = true;
              throw new Error("TIMING_FAIL");
            }
          }

          // Daily earning cap (MAX_ADS_PER_DAY) — enforced INSIDE the locked
          // transaction so concurrent submissions cannot both pass the count.
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const [viewsToday] = await tx
            .select({ n: sql<number>`COUNT(*)` })
            .from(adViews)
            .where(and(
              eq(adViews.userId, thorxPid),
              eq(adViews.completed, true),
              sql`${adViews.createdAt} >= ${todayStart}`,
            ));
          if (Number(viewsToday?.n ?? 0) >= dailyCap) {
            dailyCapExceeded = true;
            throw new Error("DAILY_CAP");
          }

          // Insert the ad_view row within the locked transaction
          const [inserted] = await tx.insert(adViews).values({
            userId: thorxPid,
            adId,
            adType: adConfig.type,
            duration: adConfig.duration,
            completed: true,
            earnedAmount: adConfig.reward,
          }).returning();
          adViewRow = inserted;

          // Record the Engine A earn event in the same transaction via tx passthrough.
          // uniq_user_transactions_source prevents a duplicate ledger row if this
          // same sourceId is ever submitted twice (defense-in-depth).
          const earnResult = await storage.recordEarnEvent({
            userId: thorxPid,
            engineType: 'Engine_A',
            grossPkr: adConfig.reward,
            sourceId: adViewRow.id,
            sourceType: 'ad_view',
            tx,
          });
          if (earnResult.pointsCredited > 0) {
            thorxCard = {
              pointsCredited: earnResult.pointsCredited,
              engineType: 'Engine_A',
            };
          }
        });
      } catch (err: any) {
        if (dailyCapExceeded) {
          return res.status(429).json({
            message: "Daily ad limit reached. Come back tomorrow to earn more.",
            error: "DAILY_LIMIT",
          });
        }
        if (timingFailed) {
          return res.status(429).json({
            message: "Protocol Interruption: Ad watch duration insufficient.",
            error: "RATE_LIMITED"
          });
        }
        throw err;
      }

      const creditedPoints = (thorxCard as { pointsCredited: number; engineType: string } | null)?.pointsCredited ?? 0;
      res.status(201).json({
        success: true,
        adView: adViewRow,
        thorxCard,
        message: creditedPoints > 0
          ? `Ad viewed — ${creditedPoints} TX-Points credited`
          : `Ad viewed — TX-Points credited`
      });
    } catch (error) {
      logger.error({ err: error }, "Create ad view error");
      res.status(500).json({
        message: "Failed to record ad view",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get today's ad views count
  app.get("/api/ad-views/today", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const count = await storage.getTodayAdViews(thorxPid);
      res.json({ count });
    } catch (error) {
      logger.error({ err: error }, "Get today ad views error:");
      res.status(500).json({
        message: "Failed to fetch ad views",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // ============================================
  // REAL-TIME ANALYTICS & DASHBOARD ENDPOINTS
  // ============================================

  // Get comprehensive dashboard statistics
  app.get("/api/dashboard/stats", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const stats = await storage.getDashboardStats(thorxPid);
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Get dashboard stats error:");
      res.status(500).json({
        message: "Failed to fetch dashboard statistics",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get earnings history for charts
  app.get("/api/earnings/history", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const period = (req.query.period as 'week' | 'month' | 'year') || 'week';
      const history = await storage.getEarningsHistory(thorxPid, period);
      res.json(history);
    } catch (error) {
      logger.error({ err: error }, "Get earnings history error:");
      res.status(500).json({
        message: "Failed to fetch earnings history",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Real (non-synthetic) earnings breakdown by engine — powers the User
  // Portal's "Earnings Breakdown" pie chart. Sourced from the immutable
  // user_transactions ledger, never fabricated/estimated splits.
  app.get("/api/earnings/breakdown", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const breakdown = await storage.getEarningsBreakdown(thorxPid);
      res.json(breakdown);
    } catch (error) {
      logger.error({ err: error }, "Get earnings breakdown error:");
      res.status(500).json({
        message: "Failed to fetch earnings breakdown",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get referral leaderboard
  app.get("/api/referrals/leaderboard", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const leaderboard = await storage.getReferralLeaderboard(thorxPid);
      // Real-time presence: "Active" means the referral actually has THORX
      // open right now (an open WebSocket), not just that they exist.
      res.json(leaderboard.map((r) => ({ ...r, isOnline: isUserOnline(r.id) })));
    } catch (error) {
      logger.error({ err: error }, "Get referral leaderboard error:");
      res.status(500).json({
        message: "Failed to fetch referral leaderboard",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get detailed referral stats with L1/L2 breakdown
  app.get("/api/referrals/stats/detailed", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const stats = await storage.getReferralStatsDetailed(thorxPid);
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Get detailed referral stats error:");
      res.status(500).json({
        message: "Failed to fetch detailed referral statistics",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get transaction history
  app.get("/api/transactions/history", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const limit = parseInt(req.query.limit as string) || 50;
      const history = await storage.getTransactionHistory(thorxPid, limit);
      res.json(history);
    } catch (error) {
      logger.error({ err: error }, "Get transaction history error");
      res.status(500).json({
        message: "Failed to fetch transaction history",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // ============================================
  // PROXY ENDPOINT FOR AD WEB PANEL
  // ============================================
  app.get("/api/proxy", requireTeamRole, async (req, res) => {
    try {
      await handleProxyRequest(req, res);

    } catch (error) {
      logger.error({ err: error }, "Proxy wrapper error:");
      res.status(500).send("Internal Proxy Error");
    }
  });

  // ============================================
  // RANKING SYSTEM ENDPOINTS
  // ============================================

  // Get rank history for current user (PS-based userRankTier — legacy Urdu rank removed)
  app.get("/api/rank/history", requireSessionAuth, async (req, res) => {
    try {
      const thorxPid = req.userProfile.id;
      const rankLogs = await storage.getRankHistory(thorxPid);
      res.json({ rankLogs });
    } catch (error) {
      logger.error({ err: error }, "Get rank history error:");
      res.status(500).json({ message: "Failed to fetch rank history", error: "INTERNAL_ERROR" });
    }
  });

  // Legacy registration permanently disabled — creates accounts with guessable
  // password hashes and no rate limiting. Returns 410 Gone so old clients get
  // a clear deprecation error instead of a 404 (audit finding L).
  app.post("/api/legacy-register", authRateLimiter, async (_req, res) => {
    res.status(410).json({
      message: "Legacy registration is no longer supported. Please use /api/register.",
      error: "ENDPOINT_DEPRECATED",
    });
  });

  // Stats endpoint for live data — intentionally public for landing-page marketing use.
  // Exposes only sanitized headline figures (no raw payout totals or PII).
  // C-05/H-03: publicApiRateLimiter (30 req/min) protects this unauthenticated endpoint.
  // H-03: Hardcoded fallback data removed — errors return a real zero-state.
  app.get("/api/stats", publicApiRateLimiter, async (_req, res) => {
    try {
      const paidResult = await pool.query(`
        SELECT COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total
        FROM withdrawals
        WHERE status = 'completed'
      `);

      const activeUsers = await storage.getActiveUsersCount();

      // Use Decimal for the financial aggregate — no float contamination.
      const totalPaid = new Decimal(paidResult.rows[0]?.total || "0").toFixed(2);

      res.json({
        totalPaid,
        activeUsers,
        securityScore: 99
      });
    } catch (error) {
      logger.error({ err: error }, "Get live stats error:");
      // Return a genuine zero-state on error — never fabricate trust signals.
      res.json({ totalPaid: "0.00", activeUsers: 0, securityScore: 99 });
    }
  });


  // Team dashboard metrics endpoints (protected for team members only)
  app.get("/api/team/metrics", requireTeamRole, async (req, res) => {
    try {
      const range = (req.query.range as string) || "7d";
      const now = new Date();
      let since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      if (range === "24h") since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      else if (range === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      else if (range === "all") since = new Date(0);

      const [activeUsers, totalEarnings] = await Promise.all([
        storage.getUsersCountInRange(since),
        storage.getEarningsSumInRange(since)
      ]);

      const extended = await storage.getExtendedMetrics().catch(() => null);
      res.json({
        activeUsers,
        totalEarnings,
        ...(extended ?? {}),
      });
    } catch (error) {
      logger.error({ err: error }, "Get team metrics error:");
      res.status(500).json({
        message: "Failed to fetch team metrics",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Team email endpoints
  const teamEmailSchema = z.object({
    recipient: z.string().email("Invalid email address"),
    subject: z.string().min(1, "Subject is required").max(500),
    message: z.string().min(1, "Message is required").max(5000),
  });

  // Send team email
  app.post("/api/team/emails", requireTeamRole, async (req, res) => {
    try {

      const { recipient, subject, message } = teamEmailSchema.parse(req.body);

      const emailData = {
        fromUserId: req.userProfile!.id,
        toEmail: recipient,
        fromEmail: req.userProfile!.email,
        subject,
        content: message,
        type: 'outbound' as const
      };

      const email = await storage.createTeamEmail(emailData);

      res.status(201).json({
        success: true,
        email,
        message: "Email sent successfully"
      });
    } catch (error) {
      logger.error({ err: error }, "Send team email error:");
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid email data",
          errors: error.errors
        });
      }

      res.status(500).json({
        message: "Failed to send email",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Get team emails (received messages)
  app.get("/api/team/emails", requirePermission("VIEW_COMMUNICATIONS"), async (req, res) => {
    try {
      const type = req.query.type as 'inbound' | 'outbound' | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;

      const emails = await storage.getTeamEmails(type, limit);

      res.json({
        emails,
        total: emails.length
      });
    } catch (error) {
      logger.error({ err: error }, "Get team emails error:");
      res.status(500).json({
        message: "Failed to fetch team emails",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Update team email status (Read, Archived)
  app.patch("/api/team/emails/:id", requireTeamRole, async (req, res) => {
    try {
      const { id } = req.params;
      const teamEmailPatchSchema = z.object({
        status: z.enum(["sent", "read", "archived"]).optional(),
        isRead: z.boolean().optional(),
      });
      const parsed = teamEmailPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0]?.message || "Invalid request" });
      }
      const { status, isRead } = parsed.data;

      const updated = await storage.updateTeamEmail(id, {
        status: status || undefined,
      });

      res.json({ success: true, email: updated });
    } catch (error) {
      logger.error({ err: error }, "Update team email error:");
      res.status(500).json({ message: "Failed to update email status" });
    }
  });
  
  // Delete team email (Hard-removal)
  app.delete("/api/team/emails/:id", requireTeamRole, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteTeamEmail(id);
      res.json({ success: true, message: "Correspondence permanently removed" });
    } catch (error) {
      logger.error({ err: error }, "Delete team email error:");
      res.status(500).json({ message: "Failed to delete correspondence" });
    }
  });

  // Get user credentials (for team data management)
  app.get("/api/team/credentials", requireTeamRole, async (req, res) => {
    try {
      const { decryptCredential, isEncrypted } = await import("./utils/credential-crypto");

      const credentials = await storage.getAllUserCredentials();

      // Decrypt passwords for the team UI (only if encrypted at rest)
      const decrypted = credentials.map(c => ({
        ...c,
        encryptedPassword: c.encryptedPassword && isEncrypted(c.encryptedPassword)
          ? decryptCredential(c.encryptedPassword)
          : c.encryptedPassword,
      }));

      res.json({
        credentials: decrypted,
        total: decrypted.length
      });
    } catch (error) {
      logger.error({ err: error }, "Get user credentials error:");
      res.status(500).json({
        message: "Failed to fetch user credentials",
        error: "INTERNAL_ERROR"
      });
    }
  });

  app.get("/api/admin/withdrawals", requirePermission("MANAGE_PAYOUTS"), adminActionRateLimiter, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 8;
      const search = req.query.search as string;
      const status = req.query.status as string;
      const sort = req.query.sort as string | undefined;

      const [result, payoutSlaHours] = await Promise.all([
        storage.getWithdrawalsPaginated({ page, limit, search, status, sort }),
        storage.getSystemConfigValue<number>("PAYOUT_SLA_HOURS", 48),
      ]);
      // Payout Operations audit: never send the raw users row to the client —
      // it carries passwordHash/verificationToken. Always pass through sanitizeUser.
      res.json({
        ...result,
        withdrawals: result.withdrawals.map(w => ({ ...w, user: sanitizeUser(w.user) })),
        // Finance audit (2026-07-29): the deadtime countdown was hardcoded to 48h
        // client-side, so admins had no way to change the SLA without a code
        // change/redeploy. Now driven by PAYOUT_SLA_HOURS (System Settings).
        payoutSlaHours,
      });
    } catch (error) {
      logger.error({ err: error }, "Fetch withdrawals error");
      res.status(500).json({ message: "Failed to fetch withdrawals" });
    }
  });

  // Per-withdrawal audit trail — spec Part G.2: "Audit table showing who approved/rejected,
  // when, and what transaction ID was provided." Queries audit_logs joined to the admin user.
  app.get("/api/admin/withdrawals/:id/audit-trail", requirePermission("MANAGE_PAYOUTS"), async (req, res) => {
    try {
      const { id } = req.params;
      const trail = await db
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          metadata: auditLogs.details,
          createdAt: auditLogs.createdAt,
          adminFirstName: users.firstName,
          adminLastName: users.lastName,
          adminEmail: users.email,
        })
        .from(auditLogs)
        .innerJoin(users, eq(auditLogs.adminId, users.id))
        .where(
          and(
            eq(auditLogs.targetType, "withdrawal"),
            eq(auditLogs.targetId, id)
          )
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(50);
      res.json({ trail });
    } catch (error) {
      logger.error({ err: error }, "Fetch withdrawal audit trail error:");
      res.status(500).json({ message: "Failed to fetch audit trail" });
    }
  });

  app.get("/api/admin/withdrawals/export", requirePermission("MANAGE_PAYOUTS"), async (req, res) => {
    try {
      const search = req.query.search as string;
      const status = req.query.status as string;
      const ids = req.query.ids ? (req.query.ids as string).split(',') : undefined;

      const filename = ids ? "THORX-Selected-Payouts" : "THORX-Full-Payout-Ledger";
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}-${new Date().toISOString().split('T')[0]}.csv`);

      // R-20: Stream in 500-row batches — never loads the full dataset into memory.
      const headers = ["ID", "Beneficiary", "Email", "Phone", "Identity", "Rank", "Amount (PKR)", "Method", "Account Name", "Account Number", "Status", "Created At"];
      res.write(headers.map(h => `"${h}"`).join(",") + "\n");

      const toCsvRow = (cells: (string | null | undefined)[]) =>
        cells.map(c => `"${String(c || "").replace(/"/g, '""')}"`).join(",");

      const BATCH = 500;
      let page = 1;
      while (true) {
        const { withdrawals: batch } = await storage.getWithdrawalsPaginated({ page, limit: BATCH, search, status, ids });
        for (const w of batch) {
          res.write(toCsvRow([
            w.id,
            `${w.user.firstName} ${w.user.lastName}`,
            w.user.email,
            w.user.phone,
            w.user.identity,
            w.user.userRankTier ?? "",
            w.amount,
            w.method,
            w.accountName,
            w.accountNumber,
            w.status,
            new Date(w.createdAt ?? new Date()).toISOString().split('T')[0],
          ]) + "\n");
        }
        if (batch.length < BATCH) break; // last page reached
        if (ids) break;                  // selective export: one batch is enough
        page++;
      }
      res.end();
    } catch (error) {
      logger.error({ err: error }, "Export withdrawals error");
      if (!res.headersSent) res.status(500).json({ message: "Failed to export withdrawals" });
    }
  });

  app.post("/api/admin/withdrawals/bulk", requirePermission("MANAGE_PAYOUTS"), adminBulkActionRateLimiter, async (req, res) => {
    try {
      const bulkWithdrawalSchema = z.object({
        ids:    z.array(z.string().uuid()).min(1, "At least one withdrawal ID required"),
        status: z.enum(["completed", "rejected", "pending", "approved", "processing"]),
      });
      const parsed = bulkWithdrawalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { ids, status } = parsed.data;

      const result = await storage.bulkUpdateWithdrawalStatus(ids, status, req.userProfile.id);
      broadcastTeamRefresh("withdrawals_bulk_updated");
      if (result.failed.length > 0) {
        logger.warn({ failed: result.failed }, "Bulk withdrawal update had partial failures");
      }

      // Fire-and-forget payout notifications for bulk status changes
      if ((status === "approved" || status === "completed" || status === "rejected") && result.succeeded.length > 0) {
        void (async () => {
          for (const wid of result.succeeded) {
            try {
              const w = await storage.getWithdrawalById?.(wid) ?? null;
              if (!w) continue;
              const owner = await storage.getUserById(w.userId);
              if (!owner) continue;
              await sendPayoutStatusEmail({
                to: owner.email,
                firstName: owner.firstName,
                status,
                amount: w.amount,
                netAmount: w.netAmount,
                fee: w.fee,
                method: w.method,
                rejectionReason: w.rejectionReason ?? null,
              });
            } catch (err) {
              logger.error({ err, withdrawalId: wid }, "[Email] Bulk payout notification failed");
            }
          }
        })();
      }

      res.json({
        message: result.failed.length === 0
          ? `Successfully updated ${result.succeeded.length} withdrawals to ${status}`
          : `Updated ${result.succeeded.length} of ${ids.length} withdrawals to ${status}; ${result.failed.length} failed`,
        succeeded: result.succeeded,
        failed: result.failed,
      });
    } catch (error) {
      logger.error({ err: error }, "Bulk update withdrawals error");
      res.status(500).json({ message: "Failed to update withdrawals" });
    }
  });

  // Admin: Get referral network tree for any user
  app.get("/api/admin/users/:userId/network", requirePermission("VIEW_USERS"), async (req, res) => {
    try {
      const { userId } = req.params;
      const referrals = await storage.getReferralLeaderboard(userId);
      const stats = await storage.getReferralStats(userId);
      res.json({ referrals: referrals.map((r) => ({ ...r, isOnline: isUserOnline(r.id) })), stats });
    } catch (error) {
      logger.error({ err: error }, "Get user network error:");
      res.status(500).json({ message: "Failed to fetch user network" });
    }
  });

  // User CRM Management Routes
  app.post("/api/admin/users/:userId/adjust-balance", requirePermission("MANAGE_USERS"), withdrawalRateLimiter, async (req, res) => {
    try {
      const { userId } = req.params;
      const { realPkrDelta, txPointsDelta, amount, type, reason, creditIntent } = req.body;
      const adminId = req.userProfile.id;

      if (!reason || String(reason).trim().length < 5) {
        return res.status(400).json({ message: "reason (≥5 chars) required." });
      }

      let pkrAmount: string;
      let adjustType: 'add' | 'subtract';
      let pointsDelta: number | undefined;

      if (realPkrDelta !== undefined) {
        // New dual-field API (Spec §5.1): realPkrDelta + txPointsDelta both required
        const dualSchema = z.object({
          realPkrDelta: z.number().min(-10000).max(10000),
          txPointsDelta: z.number().int().min(-10000000).max(10000000),
          type: z.enum(["add", "deduct"]),
          reason: z.string().min(5).max(500),
        });
        const parsed = dualSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Validation failed" });
        pkrAmount = new Decimal(realPkrDelta).abs().toFixed(2);
        adjustType = req.body.type === 'deduct' ? 'subtract' : 'add';
        pointsDelta = txPointsDelta;
      } else {
        // Legacy single-field API (backward compat) — R-13: Zod validates all fields
        const legacySchema = z.object({
          amount: z.string().regex(/^\d+(\.\d{1,4})?$/, "amount must be a non-negative decimal string"),
          type: z.enum(["add", "subtract"]),
          reason: z.string().min(5).max(500),
          creditIntent: z.enum(["verified_deposit", "admin_credit"]).optional(),
        });
        const legacyParsed = legacySchema.safeParse(req.body);
        if (!legacyParsed.success) {
          return res.status(400).json({ message: legacyParsed.error.errors[0]?.message ?? "Validation failed" });
        }
        pkrAmount = legacyParsed.data.amount;
        adjustType = legacyParsed.data.type;
      }

      const user = await storage.adjustUserBalance(userId, pkrAmount, adjustType, adminId, reason, creditIntent ?? 'admin_credit', pointsDelta, getRequestContext(req));
      broadcastUserUpdated(userId, "balance_adjusted");
      res.json(sanitizeUser(user));

      // After crediting a user, immediately re-score their risk so large admin
      // credits surface in the Risk Watchlist without waiting for the next
      // full scan. Fire-and-forget — does not block the response.
      if (type === 'add') {
        import("./modules/risk-engine").then(async ({ scoreUser, upsertRiskCase }) => {
          try {
            const result = await scoreUser(userId);
            await upsertRiskCase(result);
            logger.info({ userId, riskScore: result.riskScore, severity: result.severity }, '[RiskEngine] Re-scored after admin credit');
          } catch (e) {
            logger.error({ err: e, userId }, "[RiskEngine] Post-credit rescore failed");
          }
        });
      }
    } catch (error) {
      logger.error({ err: error }, "Adjust balance error:");
      res.status(500).json({ message: "Failed to adjust balance" });
    }
  });

  // ── Thorx Profit Ledger (Spec §19.1) ────────────────────────────────────────
  // Full profit breakdown: engine cuts + withdrawal fee revenue + 30-day chart.
  // R-14: Restricted to VIEW_PROFIT_LEDGER permission (founder/admin automatically pass).
  app.get("/api/admin/profit-ledger", requirePermission("VIEW_PROFIT_LEDGER"), adminActionRateLimiter, async (req, res) => {
    try {
      const ledger = await storage.getProfitLedger();
      res.json(ledger);
    } catch (error) {
      logger.error({ err: error }, "Profit ledger error:");
      res.status(500).json({ message: "Failed to fetch profit ledger" });
    }
  });

  // ── Ad Inventory CRUD (R-17) ──────────────────────────────────────────────
  // Runtime-configurable ad inventory stored in system_config.AD_INVENTORY_JSON.
  // Admins can adjust rewards/durations without a code deployment.
  // The in-process getAdInventory() cache expires within 60 s after any PATCH.
  const adInventoryItemSchema = z.object({
    id:       z.string().min(1).max(80).regex(/^[a-z0-9_]+$/i, "id must be alphanumeric/underscore"),
    reward:   z.string().regex(/^\d+(\.\d{1,4})?$/, "reward must be a non-negative decimal string"),
    duration: z.number().int().min(1).max(3600),
    type:     z.string().min(1).max(50),
    label:    z.string().max(100).optional(),
  });

  app.get("/api/admin/ad-inventory", requirePermission("MANAGE_ENGINE_CONFIG"), async (req, res) => {
    try {
      const raw = await storage.getSystemConfigValue<any>("AD_INVENTORY_JSON", []);
      const items = Array.isArray(raw) ? raw : JSON.parse(String(raw));
      res.json({ items });
    } catch (error) {
      logger.error({ err: error }, "Get ad-inventory error");
      res.status(500).json({ message: "Failed to fetch ad inventory" });
    }
  });

  app.patch("/api/admin/ad-inventory", requirePermission("MANAGE_ENGINE_CONFIG"), async (req, res) => {
    try {
      const schema = z.object({ items: z.array(adInventoryItemSchema).min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Validation failed" });

      // Ensure hilltop_fallback always exists as the last-resort entry
      const items = parsed.data.items;
      if (!items.some(i => i.id === "hilltop_fallback")) {
        items.push({ id: "hilltop_fallback", reward: "0.02", duration: 5, type: "network", label: "Network Fallback" });
      }
      await storage.setSystemConfigValue("AD_INVENTORY_JSON", items);
      // Bust the in-process cache so the next ad-view picks up the new config
      _adInventoryCache = null;
      _adInventoryCacheExpiry = 0;
      logger.info({ count: items.length }, "[AdInventory] Updated via admin PATCH");
      // Audit log — engine config changes must be traceable (enterprise §8)
      await storage.createAuditLog({
        adminId: (req as any).user?.id,
        actorRole: (req as any).user?.role,
        action: "ENGINE_CONFIG_UPDATE",
        targetType: "system",
        targetId: "AD_INVENTORY_JSON",
        details: { itemCount: items.length, updatedBy: (req as any).user?.email },
      }, getRequestContext(req));
      res.json({ success: true, items });
    } catch (error) {
      logger.error({ err: error }, "Patch ad-inventory error");
      res.status(500).json({ message: "Failed to update ad inventory" });
    }
  });

  // ── Per-Ad-Player Config CRUD (Spec §16.3) ────────────────────────────────
  // Manages ENGINE_A_PLAYERS_JSON system_config key. Each player overrides
  // Engine A's default PKR→TX-Points ratio for their specific ad network.
  // R-15: Restricted to MANAGE_ENGINE_CONFIG — prevents any team member from
  // silently altering ad economics. Only founder/admin pass automatically.
  app.get("/api/admin/engine-a/players", requirePermission("MANAGE_ENGINE_CONFIG"), async (req, res) => {
    try {
      const json = await storage.getSystemConfigValue<string>("ENGINE_A_PLAYERS_JSON", "[]");
      res.json({ players: JSON.parse(json) });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch ad players" });
    }
  });

  app.post("/api/admin/engine-a/players", requirePermission("MANAGE_ENGINE_CONFIG"), async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1).max(100), pkrToPointsRatio: z.number().int().min(1), variancePct: z.number().min(0).max(100) });
      const parsed = schema.parse(req.body);
      const json = await storage.getSystemConfigValue<string>("ENGINE_A_PLAYERS_JSON", "[]");
      const players = JSON.parse(json) as any[];
      const newPlayer = { id: `player_${Date.now()}`, ...parsed };
      players.push(newPlayer);
      await storage.setSystemConfigValue("ENGINE_A_PLAYERS_JSON", JSON.stringify(players));
      res.json({ player: newPlayer });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to add player" });
    }
  });

  app.patch("/api/admin/engine-a/players/:id", requirePermission("MANAGE_ENGINE_CONFIG"), async (req, res) => {
    try {
      const schema = z.object({ name: z.string().min(1).max(100).optional(), pkrToPointsRatio: z.number().int().min(1).optional(), variancePct: z.number().min(0).max(100).optional() });
      const updates = schema.parse(req.body);
      const json = await storage.getSystemConfigValue<string>("ENGINE_A_PLAYERS_JSON", "[]");
      const players = JSON.parse(json) as any[];
      const idx = players.findIndex((p: any) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ message: "Player not found" });
      players[idx] = { ...players[idx], ...updates };
      await storage.setSystemConfigValue("ENGINE_A_PLAYERS_JSON", JSON.stringify(players));
      res.json({ player: players[idx] });
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update player" });
    }
  });

  app.delete("/api/admin/engine-a/players/:id", requirePermission("MANAGE_ENGINE_CONFIG"), async (req, res) => {
    try {
      const json = await storage.getSystemConfigValue<string>("ENGINE_A_PLAYERS_JSON", "[]");
      const players = (JSON.parse(json) as any[]).filter((p: any) => p.id !== req.params.id);
      await storage.setSystemConfigValue("ENGINE_A_PLAYERS_JSON", JSON.stringify(players));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete player" });
    }
  });

  // ── Founder Profit Ledger (legacy endpoint kept for backward compat) ──────────

  app.get("/api/admin/founder/profit-summary", requirePermission("VIEW_PROFIT_LEDGER"), async (req, res) => {
    try {
      const summary = await storage.getFounderProfitSummary();
      res.json(summary);
    } catch (error) {
      logger.error({ err: error }, "Founder profit summary error:");
      res.status(500).json({ message: "Failed to fetch profit summary" });
    }
  });

  app.post("/api/admin/founder/withdrawals", requirePermission("VIEW_PROFIT_LEDGER"), withdrawalRateLimiter, async (req, res) => {
    try {
      // Founder withdrawals are a founder-only financial action — matches the
      // explicit founder-only check already enforced on the sibling GET route
      // below. VIEW_PROFIT_LEDGER alone is not sufficient here since it can be
      // granted to non-founder team members purely for read-only visibility.
      if (req.userProfile!.role !== 'founder') {
        return res.status(403).json({ message: "Founder access required" });
      }
      const founderWithdrawalSchema = z.object({
        amount:          z.string().regex(/^\d+(\.\d{1,2})?$/, "amount must be a positive decimal string with up to 2 decimal places"),
        withdrawalDate:  z.string().datetime({ message: "withdrawalDate must be an ISO datetime string" }),
        description:     z.string().max(500).optional(),
      });
      const parsed = founderWithdrawalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { amount, withdrawalDate, description } = parsed.data;
      const fw = await storage.createFounderWithdrawal({
        amount: String(amount),
        withdrawalDate: new Date(withdrawalDate),
        description: description ? String(description) : undefined,
        createdBy: req.userProfile!.id,
      });
      res.json(fw);
    } catch (error) {
      logger.error({ err: error }, "Create founder withdrawal error:");
      res.status(500).json({ message: "Failed to log withdrawal" });
    }
  });

  app.get("/api/admin/founder/withdrawals", requireTeamRole, async (req, res) => {
    try {
      if (req.userProfile!.role !== 'founder') {
        return res.status(403).json({ message: "Founder access required" });
      }
      const limit = Number(req.query.limit ?? 50);
      const offset = Number(req.query.offset ?? 0);
      const result = await storage.getFounderWithdrawals(limit, offset);
      res.json(result);
    } catch (error) {
      logger.error({ err: error }, "Get founder withdrawals error:");
      res.status(500).json({ message: "Failed to fetch withdrawals" });
    }
  });

  // ── System Health ────────────────────────────────────────────────────────────

  // Audit finding (Health Report Panel, 2026-07-29): these three routes used
  // VIEW_USERS / MANAGE_USERS, which granted "users"-section team members
  // (e.g. user support staff) visibility into financial/risk/integrity health
  // data and the ability to trigger a recompute, while "dashboard"-section
  // staff (who should see this) were blocked. Every sibling dashboard/analytics
  // read+recompute pair (leaderboard insights/force-sync, risk-cases/risk-scan)
  // uses VIEW_ANALYTICS — aligned here for consistency.
  app.get("/api/admin/system-health", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const snap = await storage.getLatestHealthSnapshot();
      if (!snap) {
        return res.json(null);
      }
      const { isSnapshotStale, DIMENSION_WEIGHTS } = await import("./modules/health-engine");
      res.json({ ...snap, isStale: isSnapshotStale(snap.recordedAt), weights: DIMENSION_WEIGHTS });
    } catch (error) {
      logger.error({ err: error }, "System health error:");
      res.status(500).json({ message: "Failed to fetch system health" });
    }
  });

  app.get("/api/admin/system-health/history", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const hours = Number(req.query.hours ?? 24);
      const history = await storage.getHealthHistory(hours);
      res.json(history);
    } catch (error) {
      logger.error({ err: error }, "System health history error:");
      res.status(500).json({ message: "Failed to fetch health history" });
    }
  });

  app.post("/api/admin/system-health/recalculate", requirePermission("VIEW_ANALYTICS"), adminActionRateLimiter, async (req, res) => {
    try {
      const { computeAndSaveHealthSnapshot, isSnapshotStale } = await import("./modules/health-engine");
      // Audit finding: computeAndSaveHealthSnapshot() used to swallow every
      // error internally and this route always responded 200 with whatever
      // the latest (possibly old, pre-failure) snapshot was — the admin saw
      // a "Health Recalculated" success toast even when nothing was
      // recalculated. It now reports success/failure explicitly.
      const saved = await computeAndSaveHealthSnapshot();
      if (!saved) {
        return res.status(500).json({
          message: "Failed to recalculate health snapshot — see server logs for details",
          error: "HEALTH_RECALC_FAILED",
        });
      }
      const snap = await storage.getLatestHealthSnapshot();
      // Audit log — manual health recalculations must be traceable (enterprise §8)
      await storage.createAuditLog({
        adminId: req.userProfile?.id,
        actorRole: req.userProfile?.role,
        action: "SYSTEM_HEALTH_RECALCULATE",
        targetType: "system",
        targetId: "health_engine",
        details: { triggeredBy: req.userProfile?.email, overallScore: (snap as any)?.overallScore },
      }, getRequestContext(req));
      res.json({ ...snap, isStale: isSnapshotStale(snap?.recordedAt) });
    } catch (error) {
      logger.error({ err: error }, "Recalculate health error:");
      res.status(500).json({ message: "Failed to recalculate health" });
    }
  });

  // ── Financial Reconciliation ─────────────────────────────────────────────────

  // R-Audit (2026-07-29): rate-limited like every other financial read (the
  // underlying query runs several full-table SUM aggregations) and now leaves
  // an audit trail like the Ledger Validator's comparable scan endpoint.
  app.get("/api/admin/reconciliation", requirePermission("VIEW_FINANCE"), adminActionRateLimiter, async (req, res) => {
    try {
      const { offset, limit } = z.object({
        offset: z.coerce.number().int().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(200).optional(),
      }).parse(req.query);
      const data = await storage.getReconciliationData({ offset, limit });
      const adminId = req.userProfile?.id;
      if (adminId) {
        await storage.createAuditLog({
          adminId,
          actorRole: req.userProfile?.role,
          action: "RECONCILIATION_VIEW",
          targetType: "system",
          targetId: "reconciliation",
          details: { netPlatformLiquidity: data.netPlatformLiquidity, unverifiedCreditExposure: data.unverifiedCreditExposure },
        }, getRequestContext(req));
      }
      res.json(data);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid query parameters", errors: error.errors });
      }
      logger.error({ err: error }, "Reconciliation error:");
      res.status(500).json({ message: "Failed to fetch reconciliation data" });
    }
  });

  // R-Audit (2026-07-29): gated by requirePermission("MANAGE_USERS") (matching the
  // ledger reconcile route's permission, since this also changes what a user's
  // recorded money is considered to be) in addition to the pre-existing founder-only
  // check, and rate-limited with withdrawalRateLimiter — the same stricter limiter
  // used for other money-mutating actions — instead of the generic admin limiter.
  // Broadcasts to the affected user like every other balance/earnings mutation.
  app.post("/api/admin/earnings/:earningId/reclassify", requirePermission("MANAGE_USERS"), withdrawalRateLimiter, async (req, res) => {
    try {
      if (req.userProfile!.role !== 'founder') {
        return res.status(403).json({ message: "Founder access required" });
      }
      const { earningId } = req.params;
      const { type } = z.object({
        type: z.enum(['verified_deposit', 'admin_credit']),
      }).parse(req.body);
      const { userId } = await storage.reclassifyEarning(earningId, type, req.userProfile!.id);
      broadcastUserUpdated(userId, "earning_reclassified");
      res.json({ success: true });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid type", errors: error.errors });
      }
      if (error?.message === "Earning not found" || error?.message?.startsWith("Cannot reclassify:")) {
        return res.status(400).json({ message: error.message });
      }
      logger.error({ err: error }, "Reclassify earning error:");
      res.status(500).json({ message: "Failed to reclassify earning" });
    }
  });

  app.get("/api/admin/notes/user/:id", requirePermission("VIEW_USERS"), async (req, res) => {
    try {
      const { id } = req.params;
      const notes = await storage.getInternalNotes("user", id);
      res.json({ notes });
    } catch (error) {
      logger.error({ err: error }, "Fetch notes error:");
      res.status(500).json({ message: "Failed to fetch internal notes" });
    }
  });

  app.post("/api/admin/notes", requirePermission("MANAGE_USERS"), async (req, res) => {
    try {
      const noteSchema = z.object({
        targetType: z.enum(["user", "withdrawal", "guild", "risk_case"]),
        targetId:   z.string().min(1),
        content:    z.string().min(1).max(2000),
      });
      const parsed = noteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid note data" });
      const adminId = req.userProfile.id;
      const note = await storage.createInternalNote({ adminId, ...parsed.data });
      res.json(note);
    } catch (error) {
      logger.error({ err: error }, "Create note error:");
      res.status(500).json({ message: "Failed to create internal note" });
    }
  });

  app.get("/api/admin/users/export", requirePermission("VIEW_USERS"), async (req, res) => {
    try {
      const search = req.query.search as string;
      const ids = req.query.ids ? (req.query.ids as string).split(',') : undefined;

      const filename = ids ? "THORX-Selected-Users" : "THORX-User-Directory";
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}-${new Date().toISOString().split('T')[0]}.csv`);

      // R-20: Stream in 500-row batches — avoids loading 10K rows into memory.
      const headers = ["ID", "First Name", "Last Name", "Email", "Phone", "Identity", "Role", "Rank", "Available Balance", "Total Earnings", "Performance Score", "Trust Status", "Referral Code", "Created At"];
      res.write(headers.map(h => `"${h}"`).join(",") + "\n");

      const toCsvRow = (cells: (string | number | null | undefined)[]) =>
        cells.map(c => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",");

      const BATCH = 500;
      let page = 1;
      let totalRecords = 0;
      while (true) {
        const { users: batch } = await storage.getUsersPaginated({ page, limit: BATCH, search, ids });
        for (const u of batch) {
          res.write(toCsvRow([
            u.id, u.firstName, u.lastName, u.email, u.phone ?? "", u.identity ?? "",
            u.role ?? "user", u.userRankTier ?? "E-Rank", u.availableBalance, u.totalEarnings,
            u.performanceScore ?? 0, u.trustStatus ?? "Normal",
            u.referralCode ?? "", new Date(u.createdAt ?? new Date()).toISOString(),
          ]) + "\n");
        }
        totalRecords += batch.length;
        if (batch.length < BATCH) break;
        if (ids) break;
        page++;
      }

      // Audit log after streaming completes
      await storage.createAuditLog({
        adminId: req.userProfile!.id,
        actorRole: req.userProfile?.role,
        action: "LEDGER_EXPORTED",
        targetType: "system",
        targetId: "user_directory",
        details: { exportType: ids ? "selective" : "full", records: totalRecords, search, ids },
      }, getRequestContext(req));

      res.end();
    } catch (error) {
      logger.error({ err: error }, "Export users error:");
      if (!res.headersSent) res.status(500).json({ message: "Failed to export user directory" });
    }
  });

  app.delete("/api/admin/users/:id", requirePermission("MANAGE_USERS"), async (req, res) => {
    try {
      const { id } = req.params;
      const targetUser = await storage.getUserById(id);
      await storage.deleteUser(id);

      // Log the destructive action for true zero-trust accountability
      if (req.userProfile && targetUser) {
        await storage.createAuditLog({
          adminId: req.userProfile.id,
          actorRole: req.userProfile?.role,
          action: "USER_DEACTIVATED",
          targetType: "user",
          targetId: id,
          details: { email: targetUser.email, role: targetUser.role },
        }, getRequestContext(req));
      }

      // closeUserSockets handles active WS sessions for deactivated accounts
      closeUserSockets(id, 4003, "Account deactivated");
      broadcastUserUpdated(id, "account_deactivated");
      res.json({ message: "User account deactivated successfully" });
    } catch (error) {
      logger.error({ err: error }, "Delete user error:");
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Update withdrawal status (Admin Action)
  const withdrawalUpdateSchema = z.object({
    status:           z.enum(["completed", "rejected", "pending", "approved", "processing"]),
    transactionId:    z.string().max(200).optional(),
    rejectionReason:  z.string().max(500).optional(),
  });

  app.patch("/api/admin/withdrawals/:id", requirePermission("MANAGE_PAYOUTS"), adminActionRateLimiter, async (req, res) => {
    try {
      const parsedBody = withdrawalUpdateSchema.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({ message: parsedBody.error.errors[0]?.message || "Validation failed", error: "VALIDATION_ERROR" });
      }
      const { status, transactionId, rejectionReason } = parsedBody.data;
      const withdrawalId = req.params.id;

      const updated = await storage.updateWithdrawalStatus(
        withdrawalId,
        status,
        req.userProfile.id,
        transactionId,
        rejectionReason
      );

      // Log the action with Full Financial Diff Tracking
      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: `WITHDRAWAL_${status.toUpperCase()}`,
        targetType: "withdrawal",
        targetId: withdrawalId,
        details: { status, amount: updated.amount, beneficiary: updated.userId, transactionId, rejectionReason },
      }, getRequestContext(req));

      // Broadcast generic user update (invalidates all OWN_DATA_QUERY_KEYS)
      broadcastUserUpdated(updated.userId, `withdrawal_${status}`);
      // Also broadcast specific event so frontend can show targeted toast (Phase 6.2)
      broadcastToUser(updated.userId, 'withdrawal_status_changed', { status, withdrawalId });

      // Fire-and-forget branded payout notification — never blocks the admin action
      if (status === "approved" || status === "completed" || status === "rejected") {
        storage.getUserById(updated.userId).then((owner) => {
          if (!owner) return;
          return sendPayoutStatusEmail({
            to: owner.email,
            firstName: owner.firstName,
            status,
            amount: updated.amount,
            netAmount: updated.netAmount,
            fee: updated.fee,
            method: updated.method,
            rejectionReason,
          });
        }).catch((err) => {
          logger.error({ err, withdrawalId }, "[Email] Payout notification failed");
        });
      }

      res.json({ success: true, withdrawal: updated });
    } catch (error) {
      // O-03: Explicitly capture financial failures in Sentry with domain context
      Sentry.captureException(error, {
        tags: { domain: "financial", operation: "updateWithdrawalStatus" },
        extra: { withdrawalId: req.params.id, adminId: req.userProfile?.id },
      });
      logger.error({ err: error }, "Update withdrawal error");
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update withdrawal" });
    }
  });

  app.get("/api/admin/audit-logs", requirePermission("VIEW_AUDIT_LOGS"), adminActionRateLimiter, async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string;
      const period = req.query.period as string;
      const ids = req.query.ids ? (req.query.ids as string).split(',') : undefined;
      const targetType = req.query.targetType as string | undefined;
      const targetId = req.query.targetId as string | undefined;
      const category = req.query.category as string | undefined;
      const action = req.query.action as string | undefined;
      const actorId = req.query.actorId as string | undefined;
      const ipAddress = req.query.ipAddress as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;

      const result = await storage.getAuditLogsPaginated({
        page, limit, search, period, ids, targetType, targetId,
        category, action, actorId, ipAddress, dateFrom, dateTo,
      });

      // Attach human-readable description to each log row
      const logsWithDescription = result.logs.map((log: any) => {
        const actorName = log.admin
          ? `${log.admin.firstName ?? ""} ${log.admin.lastName ?? ""}`.trim() || "A user"
          : "A user";
        return {
          ...log,
          description: describeAuditLog({
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            details: log.details,
            actorName,
          }),
        };
      });

      res.json({ ...result, logs: logsWithDescription });
    } catch (error) {
      logger.error({ err: error }, "Fetch audit logs error:");
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  });

  app.get("/api/admin/audit-logs/actions", requirePermission("VIEW_AUDIT_LOGS"), async (req, res) => {
    try {
      const category = req.query.category as string | undefined;
      const actions = await storage.getDistinctAuditActions(category);
      res.json({ actions });
    } catch (error) {
      logger.error({ err: error }, "Fetch distinct audit actions error:");
      res.status(500).json({ message: "Failed to fetch audit actions" });
    }
  });

  app.get("/api/admin/audit-logs/export", requirePermission("VIEW_AUDIT_LOGS"), adminActionRateLimiter, async (req, res) => {
    try {
      const search = req.query.search as string;
      const period = req.query.period as string;
      const ids = req.query.ids ? (req.query.ids as string).split(',') : undefined;
      const category = req.query.category as string | undefined;
      const action = req.query.action as string | undefined;
      const actorId = req.query.actorId as string | undefined;
      const ipAddress = req.query.ipAddress as string | undefined;
      const dateFrom = req.query.dateFrom as string | undefined;
      const dateTo = req.query.dateTo as string | undefined;
      const format = (req.query.format as string | undefined) || "csv";

      const { logs } = await storage.getAuditLogsPaginated({
        page: 1,
        limit: 10000,
        search,
        period,
        ids,
        category,
        action,
        actorId,
        ipAddress,
        dateFrom,
        dateTo,
      });

      // Build enriched rows with description, device, location
      const enrichedLogs = logs.map((l: any) => {
        const actorName = l.admin
          ? `${l.admin.firstName ?? ""} ${l.admin.lastName ?? ""}`.trim() || "A user"
          : "A user";
        const description = describeAuditLog({
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId,
          details: l.details,
          actorName,
        });
        const device = [l.deviceType, l.browser, l.os].filter(Boolean).join(" / ") || "";
        const location = [l.city, l.country].filter(Boolean).join(", ") || "";
        return { ...l, actorName, description, device, location };
      });

      // Log Data Exfiltration
      await storage.createAuditLog({
        adminId: req.userProfile!.id,
        actorRole: req.userProfile?.role,
        action: "LEDGER_EXPORTED",
        targetType: "system",
        targetId: "audit_logs",
        details: { exportType: ids ? "selective" : "period", records: enrichedLogs.length, search, period, ids, format },
      }, getRequestContext(req));

      if (format === "pdf") {
        // ── PDF export ──────────────────────────────────────────────────────
        const PDFDocument = (await import("pdfkit")).default;
        const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });

        res.setHeader("Content-Type", "application/pdf");
        const pdfFilename = ids ? "THORX-Selected-Audit-Logs" : `THORX-Audit-Logs-${period || "all"}`;
        res.setHeader("Content-Disposition", `attachment; filename=${pdfFilename}-${new Date().toISOString().split("T")[0]}.pdf`);
        doc.pipe(res);

        // Title page header
        doc.fontSize(18).font("Helvetica-Bold").text("THORX Audit Logs Export", { align: "center" });
        doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toISOString()}`, { align: "center" });
        doc.moveDown(1);

        // Column definitions
        const colWidths = [120, 80, 80, 60, 60, 80, 60, 60];
        const colHeaders = ["Description", "Action", "Actor", "Target Type", "Target ID", "Timestamp", "IP Address", "Category"];
        const pageWidth = doc.page.width - 80; // margins

        // Normalise column widths to fit page
        const totalW = colWidths.reduce((a, b) => a + b, 0);
        const scale = pageWidth / totalW;
        const scaledWidths = colWidths.map(w => w * scale);

        const drawRow = (cells: string[], isHeader: boolean) => {
          const startX = 40;
          let x = startX;
          const y = doc.y;
          const rowH = 18;

          if (isHeader) {
            doc.rect(startX, y, pageWidth, rowH).fill("#2d2d2d");
            doc.fillColor("white").fontSize(7).font("Helvetica-Bold");
          } else {
            doc.fillColor("black").fontSize(7).font("Helvetica");
          }

          cells.forEach((cell, i) => {
            const w = scaledWidths[i] ?? 60;
            doc.text(String(cell ?? "").slice(0, 80), x + 2, y + 5, { width: w - 4, lineBreak: false });
            x += w;
          });

          if (!isHeader) {
            doc.moveTo(startX, y + rowH).lineTo(startX + pageWidth, y + rowH).strokeColor("#e0e0e0").stroke();
          }

          doc.fillColor("black");
          doc.y = y + rowH;
        };

        drawRow(colHeaders, true);

        for (const l of enrichedLogs) {
          if (doc.y > doc.page.height - 60) {
            doc.addPage({ layout: "landscape" });
            drawRow(colHeaders, true);
          }
          drawRow([
            l.description,
            l.action,
            l.actorName,
            l.targetType,
            l.targetId,
            new Date(l.createdAt).toISOString(),
            l.ipAddress || "Internal",
            l.category || "",
          ], false);
        }

        doc.end();
      } else {
        // ── CSV export (default) ────────────────────────────────────────────
        const headers = [
          "ID", "Admin Name", "Admin ID", "Action", "Target Type", "Target ID",
          "Details", "IP Address", "Timestamp",
          "Category", "Actor Role", "Description", "Device", "Location",
        ];
        const rows = enrichedLogs.map((l: any) => [
          l.id,
          l.admin ? `${l.admin.firstName} ${l.admin.lastName}` : "Unknown",
          l.adminId,
          l.action,
          l.targetType,
          l.targetId,
          JSON.stringify(l.details),
          l.ipAddress || "Internal",
          new Date(l.createdAt).toISOString(),
          l.category || "",
          l.admin?.role || "",
          l.description,
          l.device,
          l.location,
        ]);

        const csvContent = [
          headers.join(","),
          ...rows.map((row: any[]) => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")),
        ].join("\n");

        res.setHeader("Content-Type", "text/csv");
        const filename = ids ? "THORX-Selected-Audit-Logs" : `THORX-Audit-Logs-${period || "all"}`;
        res.setHeader("Content-Disposition", `attachment; filename=${filename}-${new Date().toISOString().split("T")[0]}.csv`);
        res.send(csvContent);
      }
    } catch (error) {
      logger.error({ err: error }, "Export audit logs error:");
      if (!res.headersSent) res.status(500).json({ message: "Failed to export audit report" });
    }
  });

  // Get internal notes
  app.get("/api/admin/notes/:targetType/:targetId", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const { targetType, targetId } = req.params;
      const notes = await storage.getInternalNotes(targetType, targetId);
      res.json({ notes });
    } catch (error) {
      logger.error({ err: error }, "Fetch notes error:");
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  // Analytics for Admin Dashboard
  app.get("/api/admin/analytics/engine-revenue", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const range = (req.query.range as string) || "7d";
      const now = new Date();
      let since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      if (range === "24h") since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      else if (range === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      else if (range === "all") since = new Date(0);
      const revenue = await storage.getEngineRevenue(since);
      res.json(revenue);
    } catch (error) {
      logger.error({ err: error }, "Engine revenue error:");
      res.status(500).json({ message: "Failed to fetch engine revenue" });
    }
  });

  app.get("/api/admin/analytics", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const range = (req.query.range as string) || "7d";
      const now = new Date();
      let since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      if (range === "24h") since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      else if (range === "30d") since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      else if (range === "all") since = new Date(0);

      const data = await storage.getAnalyticsData(since);

      res.json(data);
    } catch (error) {
      logger.error({ err: error }, "Fetch analytics error:");
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // NOTE: the canonical "adjust balance" route is defined earlier as
  // POST /api/admin/users/:userId/adjust-balance (requirePermission("MANAGE_USERS"),
  // with broadcastUserUpdated wired in). Express matches routes in registration
  // order and both paths are structurally identical, so a second handler here
  // was always unreachable dead code — removed to eliminate the shadowing/drift
  // risk the duplicate created (it lacked the permission middleware and broadcast).

  // Contact form Zod schema — validates all fields with bounds before DB write
  // (audit findings M + P: previously raw req.body destructure, no length limits).
  const contactSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
    description: z.string().min(10).max(2000),
  });

  // User contact message endpoint
  // R-23: Two-layer rate limiting — per-IP (contactRateLimiter) then per-email (contactEmailRateLimiter).
  app.post("/api/contact", contactRateLimiter, contactEmailRateLimiter, async (req, res) => {
    try {
      const parsed = contactSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message || "Invalid contact form data.",
          error: "VALIDATION_ERROR",
          errors: parsed.error.flatten().fieldErrors,
        });
      }
      const { name, email, description } = parsed.data;

      // Create a team email entry for the contact message
      const contactEmailData = {
        fromUserId: null, // External user contact
        toEmail: "team@thorx.com", // Team email
        fromEmail: email,
        subject: `Contact Message from ${name}`,
        content: `Contact Form Submission\n\nName: ${name}\nEmail: ${email}\n\nMessage:\n${description}`,
        type: 'inbound' as const,
        status: 'sent' as const
      };

      const contactEmail = await storage.createTeamEmail(contactEmailData);

      res.status(201).json({
        success: true,
        message: "Contact message sent successfully",
        messageId: contactEmail.id
      });
    } catch (error) {
      logger.error({ err: error }, "Contact message error:");
      res.status(500).json({
        message: "Failed to send contact message",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Bootstrap founder endpoint — dev/first-boot only
  // Disabled in production. In dev, requires BOOTSTRAP_SECRET env var if set.
  app.post("/api/bootstrap-founder", bootstrapRateLimiter, async (req, res) => {
    // Hard-disable in production
    if (runtimeConfig.isProd) {
      return res.status(403).json({
        message: "Bootstrap is disabled in production. Use the seed script directly.",
        error: "FORBIDDEN"
      });
    }

    // If BOOTSTRAP_SECRET is configured, validate the caller knows it
    const bootstrapSecret = process.env.BOOTSTRAP_SECRET;
    if (bootstrapSecret) {
      const provided =
        (req.headers['x-bootstrap-secret'] as string) ||
        req.body?.bootstrapSecret;
      if (!provided || provided !== bootstrapSecret) {
        return res.status(403).json({
          message: "Invalid or missing bootstrap secret.",
          error: "FORBIDDEN"
        });
      }
    }

    try {
      // C1-03 / C2-04: Zod validation replaces manual truthy check
      const parsed = z.object({
        email: z.string().email().max(255),
        password: z.string().min(6).max(128),
        firstName: z.string().min(1).max(80).trim(),
        lastName: z.string().min(1).max(80).trim(),
        bootstrapSecret: z.string().optional(),
      }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation failed", errors: parsed.error.flatten() });
      }
      const { email, password, firstName, lastName } = parsed.data;

      // Check if any team members already exist
      const existingTeamMembers = await storage.getTeamMembers();
      if (existingTeamMembers && existingTeamMembers.length > 0) {
        return res.status(403).json({
          message: "Founder already exists. Use normal registration."
        });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          message: "Email already registered"
        });
      }

      // Create founder user
      const founderData = {
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        identity: `FOUNDER_${Date.now()}`,
        phone: "",
        email,
        password: password,
        passwordHash: password,
        referralCode: `FOUNDER-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        role: 'founder'
      };

      const founder = await storage.createUser(founderData);

      // Create founder team key
      const teamKeyData = {
        userId: founder.id,
        keyName: `${firstName} ${lastName}`,
        accessLevel: 'founder' as const,
        permissions: ['all'],
        isActive: true
      };

      await storage.createTeamKey(teamKeyData);

      try {
        await storage.createAuditLog({
          adminId: founder.id,
          actorRole: "founder",
          action: "FOUNDER_BOOTSTRAPPED",
          targetType: "system",
          targetId: founder.id,
          details: { email: founder.email },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (FOUNDER_BOOTSTRAPPED):");
      }

      // Set session
      req.session.userId = founder.id;
      req.session.user = {
        id: founder.id,
        email: founder.email,
        firstName: founder.firstName,
        lastName: founder.lastName,
        role: founder.role || 'founder'
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.json({
        message: "Founder account created successfully",
        user: {
          id: founder.id,
          email: founder.email,
          firstName: founder.firstName,
          lastName: founder.lastName,
          role: founder.role
        }
      });
    } catch (error) {
      logger.error({ err: error }, "Bootstrap founder error:");
      res.status(500).json({
        message: "Failed to create founder account"
      });
    }
  });

  // ── Beta trust: honesty-rules acknowledgment ────────────────────────────
  app.post("/api/user/acknowledge-rules", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const at = await acknowledgeRules(userId);
      res.json({ success: true, rulesAcknowledgedAt: at });
    } catch (error) {
      logger.error({ err: error }, "acknowledge-rules error");
      res.status(500).json({ message: "Failed to acknowledge rules" });
    }
  });

  app.get("/api/user/rules-status", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      res.json({ rulesAcknowledgedAt: await getRulesAcknowledgedAt(userId) });
    } catch {
      res.status(500).json({ message: "Failed to load rules status" });
    }
  });

  // ── Beta trust: feedback inbox (user side) ──────────────────────────────
  app.post("/api/feedback", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const schema = z.object({ category: z.string().optional(), message: z.string().min(5).max(2000) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const row = await submitFeedback(userId, parsed.data.category ?? "general", parsed.data.message);
      res.status(201).json({ success: true, feedback: row });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to submit feedback";
      res.status(400).json({ message: msg });
    }
  });

  app.get("/api/feedback/mine", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      res.json({ feedback: await listMyFeedback(userId) });
    } catch {
      res.status(500).json({ message: "Failed to load feedback" });
    }
  });

  // Team portal: feedback triage inbox
  app.get("/api/team/feedback", requireSessionAuth, async (req, res) => {
    try {
      const role = req.userProfile?.role || "";
      if (!["team", "admin", "founder"].includes(role)) return res.status(403).json({ message: "Team access required" });
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      res.json({ feedback: await listFeedbackForTeam(status) });
    } catch {
      res.status(500).json({ message: "Failed to load feedback inbox" });
    }
  });

  app.patch("/api/team/feedback/:id", requireSessionAuth, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const role = req.userProfile?.role || "";
      if (!["team", "admin", "founder"].includes(role)) return res.status(403).json({ message: "Team access required" });
      const schema = z.object({
        status: z.enum(["open", "triaged", "resolved"]),
        adminResponse: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const row = await changeFeedbackStatus(req.params.id, parsed.data.status, parsed.data.adminResponse, adminId);
      res.json({ feedback: row });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update feedback";
      res.status(400).json({ message: msg });
    }
  });

  // ── Beta invites: founder/admin mint & manage codes ─────────────────────
  app.post("/api/team/beta/invites", requireSessionAuth, async (req, res) => {
    try {
      const role = req.userProfile?.role || "";
      if (!["admin", "founder"].includes(role)) return res.status(403).json({ message: "Admin access required" });
      const schema = z.object({
        maxUses: z.number().int().min(1).max(1000).optional(),
        note: z.string().max(200).optional(),
      });
      const parsed = schema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const invite = await createBetaInvite({
        maxUses: parsed.data.maxUses ?? 1,
        note: parsed.data.note,
        createdByEmail: req.userProfile?.email,
      });
      try {
        await storage.createAuditLog({
          adminId: getThorxPrincipalId(req) as string,
          actorRole: role,
          action: "BETA_INVITE_CREATED",
          targetType: "beta_invite",
          targetId: invite.id,
          details: { code: invite.code, maxUses: invite.maxUses, note: invite.note },
        }, getRequestContext(req));
      } catch { /* non-blocking */ }
      res.status(201).json({ invite });
    } catch (error) {
      logger.error({ err: error }, "create beta invite error");
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  app.get("/api/team/beta/invites", requireSessionAuth, async (req, res) => {
    try {
      const role = req.userProfile?.role || "";
      if (!["team", "admin", "founder"].includes(role)) return res.status(403).json({ message: "Team access required" });
      res.json({ invites: await listBetaInvites(), ...(await getBetaStatus()) });
    } catch {
      res.status(500).json({ message: "Failed to list invites" });
    }
  });

  app.patch("/api/team/beta/invites/:id", requireSessionAuth, async (req, res) => {
    try {
      const role = req.userProfile?.role || "";
      if (!["admin", "founder"].includes(role)) return res.status(403).json({ message: "Admin access required" });
      const invite = await deactivateBetaInvite(req.params.id);
      res.json({ invite });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update invite";
      res.status(400).json({ message: msg });
    }
  });

  // Public beta status — drives the invite-code field on the auth page
  app.get("/api/beta/status", async (req, res) => {
    try {
      res.json(await getBetaStatus());
    } catch {
      res.json({ inviteRequired: false, slotsRemainingLabel: null });
    }
  });

  // Register new user
  app.post("/api/register", authRateLimiter, async (req, res) => {
    try {
      const { firstName, lastName, email, password, phone, identity, referralCode, role, deviceFingerprint } = req.body;
      debugLog(`[POST /api/register] Attempt for ${email}. Role: ${role}`);

      // ── Geo / VPN guard (anti-fraud Layer 2) ────────────────────────────
      const geoBlock = await enforceGeoPolicy(req as any, res, "register");
      if (geoBlock) return geoBlock;

      const { betaInviteCode } = req.body;

      // ── Beta invite gate (controlled 1000-user beta cap) ────────────────
      const inviteRequired = await storage.getSystemConfigValue<boolean>("BETA_INVITE_REQUIRED", false);
      if (inviteRequired && !["team", "founder", "admin"].includes(role || "user")) {
        try {
          await validateBetaInvite(String(betaInviteCode ?? ""));
        } catch (inviteErr) {
          return res.status(403).json({
            message: inviteErr instanceof Error ? inviteErr.message : "Invalid invite code.",
            error: "BETA_INVITE_REQUIRED",
          });
        }
      }

      // R-22: Single canonical validator — manual pre-check removed to avoid drift.
      // Validate using registerSchema
      const parsed = registerSchema.safeParse({ firstName, lastName, email, password, phone, identity, referralCode, role });
      if (!parsed.success) {
        return res.status(400).json({
          message: parsed.error.errors[0]?.message || "Validation failed",
          error: "VALIDATION_ERROR"
        });
      }

      // Check for existing user
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({
          message: "Email already registered",
          error: "DUPLICATE_EMAIL"
        });
      }

      // Device fingerprint abuse check: max 1 user-role account per device.
      // team/founder/admin roles remain exempt (a person may hold one personal
      // account plus one team/founder/admin account on the same device).
      if (deviceFingerprint && typeof deviceFingerprint === "string" && !['team', 'founder', 'admin'].includes(role || 'user')) {
        const existingCount = await storage.getAccountCountByFingerprint(deviceFingerprint);
        if (existingCount >= 1) {
          return res.status(429).json({
            message: "Maximum number of accounts reached for this device. Contact support if you believe this is an error.",
            error: "DEVICE_LIMIT_EXCEEDED"
          });
        }
      }

      // Resolve referral code
      let referredBy = undefined;
      if (referralCode) {
        const referrer = await storage.getUserByReferralCode(referralCode);
        if (referrer) {
          referredBy = referrer.id;
        }
      }

      const newUser = await storage.createUser({
        firstName,
        lastName,
        email,
        phone: (phone && phone.trim() !== '') ? normalizePhoneNumber(phone) : "",
        identity,
        referralCode: referralCode || '',
        role: 'user', // always "user" — elevated roles via bootstrap/invitations only
        passwordHash: password,
        password: password,
        name: `${firstName} ${lastName}`,
        referredBy,
      });
      debugLog(`[POST /api/register] User created: ${newUser.id}`);

      try {
        await storage.createAuditLog({
          adminId: newUser.id,
          actorRole: "user",
          action: "USER_REGISTERED",
          targetType: "user",
          targetId: newUser.id,
          details: { email: newUser.email, referredBy: referredBy ?? null, viaReferralCode: !!referralCode },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (USER_REGISTERED):");
      }

      // Store device fingerprint if provided
      if (deviceFingerprint && typeof deviceFingerprint === "string") {
        try {
          await storage.createDeviceFingerprint({
            userId: newUser.id,
            fingerprintHash: deviceFingerprint,
            userAgent: req.headers["user-agent"] || null,
            ipAddress: req.ip || null,
          });
        } catch (fpErr) {
          logger.error({ err: fpErr }, "Device fingerprint storage failed (non-blocking):");
        }
      }

      // Consume one use of the beta invite (only after the account exists).
      if (typeof betaInviteCode === "string" && betaInviteCode.trim()) {
        await finalizeBetaInviteUse(betaInviteCode, newUser.id);
      }

      // Mark email as verified immediately (no OTP required)
      await storage.markUserEmailVerified(newUser.id);

      // Regenerate session ID to prevent fixation before assigning identity
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Set session data
      req.session.userId = newUser.id;
      req.session.user = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role || 'user'
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      res.status(201).json({
        success: true,
        message: "Registration successful",
        user: buildAuthUserPayload(newUser),
      });
    } catch (error) {
      logger.error({ err: error, body: { email: req.body?.email, role: req.body?.role } }, "Registration error");
      res.status(500).json({
        message: "Registration failed",
        error: "INTERNAL_ERROR"
      });
    }
  });

  const forgotPasswordSchema = z.object({
    email: z.string().email("Invalid email address")
  });

  app.post("/api/forgot-password", authRateLimiter, async (req, res) => {
    // F-09 / S-07: Self-service email token password-reset flow.
    // Always return 200 regardless of whether the email exists — prevents
    // user enumeration (security hardening finding S-07).
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid request" });
    }
    const { email } = parsed.data;
    try {
      const user = await storage.getUserByEmail(email);
      if (user && user.isActive) {
        // Invalidate any existing unused tokens for this user (rate-limit abuse prevention)
        await db.update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(and(
            eq(passwordResetTokens.userId, user.id),
            sql`${passwordResetTokens.usedAt} IS NULL`
          ));

        // Generate a random 32-byte token; only its SHA-256 hash is stored
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt });

        // Build the reset URL using the public Replit dev domain when no APP_URL is configured
        const appUrl = process.env.APP_URL
          ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "");
        const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

        // Fire-and-forget — email failures are logged but should not 500 the request
        sendPasswordResetEmail({ to: email, firstName: user.firstName, resetUrl }).catch((err) => {
          logger.error({ err, userId: user.id }, "[Email] Password-reset delivery failed");
        });
      }
    } catch (err) {
      // Log but swallow — we return 200 either way to prevent user enumeration
      logger.error({ err, email }, "[ForgotPassword] Unexpected error");
    }

    res.json({ success: true, message: "If an account with that email exists, a reset link has been sent." });
  });

  const resetPasswordSchema = z.object({
    token: z.string().min(1, "Token is required"),
    password: z.string().min(8, "Password must be at least 8 characters")
  });

  app.post("/api/reset-password", authRateLimiter, async (req, res) => {
    // F-09 / S-07: Validate token, update password, invalidate all sessions.
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid request" });
    }
    const { token, password } = parsed.data;
    try {
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

      const [record] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash));

      if (!record) return res.status(400).json({ message: "Invalid or expired reset link." });
      if (record.usedAt) return res.status(400).json({ message: "This reset link has already been used." });
      if (new Date() > record.expiresAt) return res.status(400).json({ message: "This reset link has expired. Please request a new one." });

      // Hash new password and update the user
      const passwordHash = await bcrypt.hash(password, 10);
      await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, record.userId));

      // Mark token as used (prevents replay)
      await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, record.id));

      // Close any active WS sessions — forces re-login on all devices
      closeUserSockets(record.userId, 4001, "Password reset — please log in again");

      try {
        await storage.createAuditLog({
          adminId: record.userId,
          actorRole: "user",
          action: "PASSWORD_RESET",
          targetType: "user",
          targetId: record.userId,
          details: { method: "email_token" },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (PASSWORD_RESET):");
      }

      logger.info({ userId: record.userId }, "[ResetPassword] Password updated via email token");
      res.json({ success: true, message: "Password updated successfully. Please log in with your new password." });
    } catch (err) {
      logger.error({ err }, "[ResetPassword] Error during password reset");
      res.status(500).json({ message: "Failed to reset password. Please try again." });
    }
  });

  // Mark user email as verified (session-based — requires active session)
  // authRateLimiter added: high-severity audit finding — endpoint was unprotected.
  app.post("/api/auth/mark-verified", authRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req);
      if (!userId) {
        return res.status(401).json({ message: "Authentication required", error: "UNAUTHORIZED" });
      }
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found", error: "NOT_FOUND" });
      }
      await storage.markUserEmailVerified(user.id);
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "EMAIL_VERIFIED",
          targetType: "user",
          targetId: user.id,
          details: {},
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (EMAIL_VERIFIED):");
      }
      res.json({ success: true, message: "Email verification confirmed" });
    } catch (error) {
      logger.error({ err: error }, "Mark verified error:");
      res.status(500).json({ message: "Failed to mark verification", error: "INTERNAL_ERROR" });
    }
  });

  // Login endpoint
  app.post("/api/login", authRateLimiter, async (req, res) => {
    try {
      const { email, password, deviceFingerprint } = req.body;
      debugLog(`[POST /api/login] Attempt for ${email ?? "(no email)"}`);

      // ── Geo / VPN guard (anti-fraud Layer 2) ────────────────────────────
      const geoBlock = await enforceGeoPolicy(req as any, res, "login");
      if (geoBlock) return geoBlock;

      if (!email || !password) {
        return res.status(400).json({
          message: "Email and password are required",
          error: "BAD_REQUEST",
        });
      }

      const user = await storage.validateUserPassword(email, password);
      if (!user) {
        logger.warn({ email }, "[POST /api/login] Password validation failed");
      }

      if (!user) {
        storage.logAuthEvent(email, false, "invalid_credentials", req.ip).catch(() => {});
        return res.status(401).json({
          message: "Invalid email or password",
          error: "UNAUTHORIZED"
        });
      }

      // ── TOTP 2FA gate: password OK, but a live authenticator code is
      // required before any session is issued. Frontend reacts to the
      // TOTP_REQUIRED error code by revealing the code input.
      if (user.totpEnabled) {
        const totpCode = typeof req.body?.totpCode === "string" ? req.body.totpCode.trim() : "";
        if (!totpCode) {
          return res.status(401).json({
            message: "Enter your 6-digit authenticator code to continue.",
            error: "TOTP_REQUIRED",
          });
        }
        if (!user.totpSecret) {
          logger.error({ email }, "[POST /api/login] 2FA enabled but secret missing");
          return res.status(401).json({
            message: "2FA configuration error. Contact support.",
            error: "TOTP_CONFIG_ERROR",
          });
        }
        try {
          const totpSecret = decryptCredential(user.totpSecret);
          if (!verifyTotp(totpSecret, totpCode)) {
            storage.logAuthEvent(email, false, "invalid_totp", req.ip).catch(() => {});
            return res.status(401).json({
              message: "Invalid 2FA code",
              error: "INVALID_TOTP",
            });
          }
        } catch (totpErr) {
          logger.error({ err: totpErr }, "[POST /api/login] 2FA verification error");
          return res.status(401).json({
            message: "2FA verification failed",
            error: "INVALID_TOTP",
          });
        }
      }

      // Step 5: Email verification gate — only for regular users
      // Team, founder, and admin roles are exempt from OTP verification
      const isPrivilegedRole = ['team', 'admin', 'founder'].includes(user.role || '');
      if (!isPrivilegedRole && !user.emailVerifiedAt && !user.isVerified) {
        storage.logAuthEvent(email, false, "email_not_verified", req.ip).catch(() => {});
        return res.status(403).json({
          message: "Email verification required. Please verify your email to continue.",
          error: "EMAIL_NOT_VERIFIED",
          requireVerification: true,
          email: user.email,
        });
      }

      // Hard Lockout Check on Login: Prevent team members with suspended keys from logging in
      if (isPrivilegedRole) {
        const teamKeys = await storage.getTeamKeysByUser(user.id);
        if (teamKeys && teamKeys.length > 0) {
          if (!teamKeys[0].isActive && user.role !== 'founder') {
            storage.logAuthEvent(email, false, "suspended", req.ip).catch(() => {});
            return res.status(401).json({
              message: "Account suspended: Your cryptographic key has been revoked or frozen.",
              error: "UNAUTHORIZED"
            });
          }
        }
      }

      // Store device fingerprint on login
      if (deviceFingerprint && typeof deviceFingerprint === "string") {
        try {
          await storage.createDeviceFingerprint({
            userId: user.id,
            fingerprintHash: deviceFingerprint,
            userAgent: req.headers["user-agent"] || null,
            ipAddress: req.ip || null,
          });
        } catch (fpErr) {
          logger.error({ err: fpErr }, "Login fingerprint storage failed (non-blocking):");
        }
      }

      // Regenerate session ID to prevent fixation before assigning identity
      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Set session data
      req.session.userId = user.id;
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role || 'user'
      };

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      // Implement Auth-Zero-Trust Reporting
      if (user.role === 'admin' || user.role === 'founder') {
        try {
          await storage.createAuditLog({
            adminId: user.id,
            actorRole: user.role,
            action: "ADMIN_AUTH_SUCCESS",
            targetType: "system",
            targetId: user.id,
            details: {
              role: user.role,
              method: "password"
            },
          }, getRequestContext(req));
        } catch (e) {
          logger.error({ err: e }, "Failed to write access log");
        }
      }

      storage.logAuthEvent(email, true, undefined, req.ip).catch(() => {});

      res.json({
        message: "Login successful",
        user: buildAuthUserPayload(user),
      });
    } catch (error) {
      logger.error({ err: error }, "Login error:");
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Endpoint to get user profile, requires authentication
  app.get("/api/profile", requireSessionAuth, async (req, res) => {
    try {
      // User is authenticated, fetch profile details
      const user = await storage.getUserById(getThorxPrincipalId(req)!);
      if (!user) {
        return res.status(404).json({
          message: "User profile not found",
          error: "USER_NOT_FOUND"
        });
      }

      res.json(buildAuthUserPayload(user));
    } catch (error) {
      logger.error({ err: error }, "Get profile error:");
      res.status(500).json({
        message: "Failed to fetch profile data",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Update user profile endpoint
  app.patch("/api/profile", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req)!;

      // Validate and sanitize data
      const updateSchema = z.object({
        firstName: z.string().min(2, "First name must be at least 2 characters").optional(),
        lastName: z.string().min(2, "Last name must be at least 2 characters").optional(),
        name: z.string().optional(),
        phone: z.string().min(10, "Phone number must be at least 10 digits").optional(),
        identity: z.string().min(1, "Identity is required").optional(),
        avatar: z.string().optional(),
        profilePicture: z
          .union([z.string().max(12_000_000), z.null()])
          .optional(), // data URL, https URL, or null to clear (max ~9MB base64)
      });

      const validatedData = updateSchema.parse(req.body);

      // Handle combined name if provided
      if (validatedData.name) {
        const parts = validatedData.name.trim().split(/\s+/);
        validatedData.firstName = parts[0];
        validatedData.lastName = parts.slice(1).join(" ") || parts[0];
        delete (validatedData as any).name;
      }

      const existingRow = await storage.getUserById(userId);
      if (!existingRow) {
        return res.status(404).json({
          message: "User not found",
          error: "USER_NOT_FOUND",
        });
      }

      let resolvedProfilePicture: string | null | undefined = undefined;
      if (Object.prototype.hasOwnProperty.call(req.body, "profilePicture")) {
        try {
          resolvedProfilePicture = await processProfilePicture(
            validatedData.profilePicture as string | null | undefined,
          );
        } catch (picErr: unknown) {
          return res.status(400).json({
            message: picErr instanceof Error ? picErr.message : "Invalid profile image",
          });
        }
      }
      delete (validatedData as { profilePicture?: unknown }).profilePicture;

      const updatePayload = {
        ...validatedData,
        ...(resolvedProfilePicture !== undefined ? { profilePicture: resolvedProfilePicture } : {}),
      };

      // Update user in storage
      const updatedUser = await storage.updateUser(userId, updatePayload);

      if (!updatedUser) {
        return res.status(404).json({
          message: "User not found",
          error: "USER_NOT_FOUND"
        });
      }

      // Audit log for self-service profile change — enriched with before/after diff
      try {
        const profilePictureChanged = resolvedProfilePicture !== undefined;
        const diff = diffFields(existingRow, updatedUser, ["firstName", "lastName", "phone", "identity", "avatar"]);
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "UPDATE_PROFILE",
          targetType: "user",
          targetId: updatedUser.id,
          details: {
            fields: Object.keys(updatePayload).filter((k) => (updatePayload as Record<string, unknown>)[k] !== undefined),
            diff,
            profilePictureChanged,
          },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "UPDATE_PROFILE audit log failed (non-blocking):");
      }

      // Update session data if name changed
      if (validatedData.firstName || validatedData.lastName) {
        req.session.user = {
          id: updatedUser.id,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          role: updatedUser.role || 'user'
        };
        await new Promise<void>((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      res.json({
        message: "Profile updated successfully",
        user: {
          id: updatedUser.id,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          name: `${updatedUser.firstName} ${updatedUser.lastName}`.trim(),
          email: updatedUser.email,
          identity: updatedUser.identity,
          phone: updatedUser.phone,
          referralCode: updatedUser.referralCode,
          totalEarnings: updatedUser.totalEarnings,
          availableBalance: updatedUser.availableBalance,
          isActive: updatedUser.isActive,
          createdAt: updatedUser.createdAt,
          role: updatedUser.role || 'user',
          avatar: (updatedUser as any).avatar,
          profilePicture: (updatedUser as any).profilePicture,
          // THORX v3 fields
          userRankTier: updatedUser.userRankTier || 'E-Rank',
          guildRole: updatedUser.guildRole || 'simple',
          guildId: updatedUser.guildId || null,
          performanceScore: updatedUser.performanceScore ?? 0,
          streakDays: updatedUser.streakDays ?? 0,
          txPointsBalance: updatedUser.txPointsBalance ?? 0,
          lastActiveAt: updatedUser.lastActiveAt ?? null,
        }
      });
    } catch (error) {
      logger.error({ err: error }, "Update profile error:");
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid profile data",
          errors: error.errors
        });
      }

      res.status(500).json({
        message: "Failed to update profile",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // Chatbot API routes - works with or without authentication
  app.post("/api/chat", chatbotRateLimiter, async (req, res) => {
    try {
      const chatInputSchema = z.object({
        message:   z.string().min(1, "Message is required").max(1000, "Message too long. Maximum 1000 characters.").trim(),
        sessionId: z.string().max(200).optional(),
      });
      const parsed = chatInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input", error: "INVALID_INPUT" });
      const { message, sessionId } = parsed.data;

      let userId = 'anonymous';
      let userName = 'User';

      const chatPrincipalId = getThorxPrincipalId(req);
      if (chatPrincipalId) {
        userId = chatPrincipalId;
        const userProfile = await storage.getUserById(chatPrincipalId);
        if (userProfile) {
          userName = userProfile.firstName || 'User';
        }
      }

      const chatSessionId = sessionId || `session_${Date.now()}`;

      const { advancedChatbotService } = await import('./chatbot/advanced-chatbot-service');
      const botResponse = advancedChatbotService.processMessage(
        message.trim(),
        userName,
        userId,
        chatSessionId
      );

      if (userId !== 'anonymous') {
        try {
          await storage.createChatMessage({
            userId,
            message: message.trim(),
            sender: 'user',
            language: botResponse.language,
            intent: botResponse.intent,
            sentiment: botResponse.sentiment,
            metadata: { confidence: botResponse.confidence }
          });

          await storage.createChatMessage({
            userId,
            message: botResponse.response,
            sender: 'support',
            language: botResponse.language,
            intent: botResponse.intent,
            sentiment: 'neutral',
            metadata: {
              confidence: botResponse.confidence,
              suggestedActions: botResponse.suggestedActions,
              isEscalation: botResponse.isEscalation
            }
          });
        } catch (dbError) {
          logger.error({ err: dbError }, 'Failed to save chat messages:');
        }
      }

      res.json({
        response: botResponse.response,
        language: botResponse.language,
        intent: botResponse.intent,
        confidence: botResponse.confidence,
        sentiment: botResponse.sentiment,
        suggestedActions: botResponse.suggestedActions,
        isEscalation: botResponse.isEscalation
      });
    } catch (error) {
      logger.error({ err: error }, "Chatbot error:");
      res.status(500).json({
        message: "Failed to process message",
        error: "INTERNAL_ERROR"
      });
    }
  });

  app.get("/api/chat/stats", requireSessionAuth, async (req, res) => {
    try {
      const { advancedChatbotService } = await import('./chatbot/advanced-chatbot-service');
      const stats = advancedChatbotService.getStats();
      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Chat stats error:");
      res.status(500).json({
        message: "Failed to fetch chat stats",
        error: "INTERNAL_ERROR"
      });
    }
  });

  app.get("/api/chat/history", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const messages = await storage.getUserChatHistory(userId, limit);

      res.json({
        messages: messages.reverse()
      });
    } catch (error) {
      logger.error({ err: error }, "Chat history error:");
      res.status(500).json({
        message: "Failed to fetch chat history",
        error: "INTERNAL_ERROR"
      });
    }
  });

  // HilltopAds Configuration Routes (Team/Founder only)
  app.post("/api/hilltopads/config", requireTeamRole, async (req, res) => {
    try {
      const hilltopAdsConfigSchema = z.object({
        apiKey:      z.string().min(1, "API key is required").max(500),
        publisherId: z.string().max(200).optional(),
        settings:    z.record(z.unknown()).optional().default({}),
      });
      const parsed = hilltopAdsConfigSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { apiKey, publisherId, settings } = parsed.data;

      const config = await storage.createHilltopAdsConfig({
        apiKey,
        publisherId,
        isActive: true,
        settings: settings || {}
      });

      try {
        await storage.createAuditLog({
          adminId: req.userProfile?.id as string,
          actorRole: req.userProfile?.role,
          action: "HILLTOPADS_CONFIG_CREATED",
          targetType: "system",
          targetId: config.id,
          // apiKey is a secret — never persisted into the audit trail.
          details: { publisherId: publisherId ?? null, apiKeyConfigured: true },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (HILLTOPADS_CONFIG_CREATED):");
      }

      res.json(config);
    } catch (error) {
      logger.error({ err: error }, "Create HilltopAds config error:");
      res.status(500).json({ message: "Failed to create config", error: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/hilltopads/config", requireTeamRole, async (req, res) => {
    try {
      const config = await storage.getHilltopAdsConfig();
      res.json(config || null);
    } catch (error) {
      logger.error({ err: error }, "Get HilltopAds config error:");
      res.status(500).json({ message: "Failed to fetch config", error: "INTERNAL_ERROR" });
    }
  });

  // Public/Authenticated System Configuration Access
  // C-05: Strict public allowlist — only non-sensitive UI keys are exposed without auth.
  // Keys readable by ANY authenticated user. Fee %, conversion rate and min
  // payout are display/withdrawal-copy values the UserPortal needs and are
  // already exposed (conversionRate, withdrawalFeePct) via /api/config/public
  // — keeping them here avoids 403s on every portal load. Business-sensitive
  // keys (ad network config, engine cuts, economy overrides) stay restricted.
  const PUBLIC_CONFIG_KEYS = new Set([
    "MIN_PAYOUT",
    "WITHDRAWAL_FEE_PCT",
    "REFERRAL_FEE_SHARE_PCT",
    "CONVERSION_RATE",
  ]);
  app.get("/api/config/:key", publicApiRateLimiter, async (req, res) => {
    try {
      const { key } = req.params;

      if (!PUBLIC_CONFIG_KEYS.has(key)) {
        // Require authentication for any key outside the safe public set.
        const principalId = getThorxPrincipalId(req);
        if (!principalId) {
          return res.status(403).json({
            message: "Access to this configuration key is restricted.",
            error: "RESTRICTED_ACCESS"
          });
        }
        // Authenticated users may only read keys explicitly permitted for their role.
        // For now, require team-level access for any non-public key.
        const profile = req.userProfile;
        if (!profile || !["founder", "admin", "team"].includes(profile.role)) {
          return res.status(403).json({
            message: "Access to this configuration key requires elevated permissions.",
            error: "RESTRICTED_ACCESS"
          });
        }
      }

      const value = await storage.getSystemConfigValue(key, null);
      res.json({ key, value });
    } catch (error) {
      logger.error({ err: error, key: req.params.key }, "Error fetching config");
      res.status(500).json({ message: "Failed to fetch configuration" });
    }
  });

  // Audit finding 2-A: The GET /api/admin/config and PATCH /api/admin/config/:key routes
  // below were dead code — Express matched the first-registered handlers at lines 399/418
  // (requirePermission("MANAGE_SYSTEM")) before ever reaching the requireTeamRole versions
  // here. The allowedKeys safety list in the dead PATCH was never enforced. Both removed.

  // --- Tasks Management (Admin) ---
  // ── Engine B Admin CRUD ───────────────────────────────────────────────────────
  app.get("/api/admin/engine-b-tasks", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      const tasks = await storage.getEngineBTasks();
      res.json(tasks);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Engine B tasks" });
    }
  });

  app.post("/api/admin/engine-b-tasks", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      // Audit finding (Task & Ad Management, 2026-07-28): the auto-generated
      // insertEngineBTaskSchema only knew grossPkrPerCompletion was a string (from the
      // decimal column type) with no format check — unlike weekly-tasks' matching field,
      // which already validates this regex. Extend it here so a malformed value 400s
      // instead of reaching the DB as an unparsable decimal.
      const validatedData = insertEngineBTaskSchema.extend({
        grossPkrPerCompletion: z.string().regex(/^\d+(\.\d+)?$/, "grossPkrPerCompletion must be a positive decimal string"),
      }).parse(req.body);
      const task = await storage.createEngineBTask(validatedData);
      res.status(201).json(task);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        logger.error({ errors: error.errors }, "[ENGINE_B_TASK_POST] Validation Error");
      }
      res.status(400).json({ message: "Invalid task data", error: error instanceof z.ZodError ? error.errors : (error.message || "GENERIC_ERROR") });
    }
  });

  app.patch("/api/admin/engine-b-tasks/:id", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      const updateSchema = z.object({
        title:                 z.string().min(1).max(200).optional(),
        description:           z.string().max(1000).optional(),
        actionUrl:             z.string().url().optional().nullable(),
        secretCode:            z.string().max(100).optional().nullable(),
        instructions:          z.string().max(2000).optional().nullable(),
        targetRank:            z.enum(["E-Rank","D-Rank","C-Rank","B-Rank","A-Rank","S-Rank"]).optional(),
        difficulty:            z.enum(["Easy","Medium","Hard","Elite"]).optional(),
        isActive:              z.boolean().optional(),
        grossPkrPerCompletion: z.string().regex(/^\d+(\.\d+)?$/, "grossPkrPerCompletion must be a positive decimal string").optional(),
      });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      const task = await storage.updateEngineBTask(req.params.id, parsed.data);
      if (!task) return res.status(404).json({ message: "Task not found" });
      res.json(task);
    } catch (error) {
      res.status(400).json({ message: "Failed to update Engine B task" });
    }
  });

  app.delete("/api/admin/engine-b-tasks/:id", requirePermission("MANAGE_TASKS"), async (req, res) => {
    try {
      await storage.deleteEngineBTask(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete task" });
    }
  });

  // ── Engine B User Endpoints ───────────────────────────────────────────────────
  app.get("/api/engine-b/tasks", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const tasksWithRecords = await storage.getEngineBTasksForUser(userId);
      res.json(tasksWithRecords);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Engine B tasks" });
    }
  });

  app.post("/api/engine-b/tasks/:id/click", requireSessionAuth, earnRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const taskId = req.params.id;
      let record = await storage.getEngineBRecord(userId, taskId);
      if (record) {
        if (record.status === "completed") return res.json({ message: "Task already completed", record });
        record = await storage.updateEngineBRecord(record.id, { clickedAt: new Date() });
      } else {
        record = await storage.createEngineBRecord({ userId, taskId, status: "pending", clickedAt: new Date() });
      }
      res.json(record);
    } catch (error) {
      res.status(500).json({ message: "Failed to record task click" });
    }
  });

  // POST /api/engine-b/tasks/:id/verify — atomic: record + earn event in one transaction
  app.post("/api/engine-b/tasks/:id/verify", requireSessionAuth, earnRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const taskId = req.params.id;
      const { code } = req.body;

      const task = await storage.getEngineBTask(taskId);
      if (!task || !task.isActive) return res.status(404).json({ message: "Task not found" });

      const record = await storage.getEngineBRecord(userId, taskId);
      if (!record || !record.clickedAt) return res.status(400).json({ message: "Task session not initialized. Click the link first." });
      if (record.status === "completed") return res.json({ message: "Task already completed", record });

      // Anti-cheat: 10-second minimum engagement
      const diffSeconds = (Date.now() - new Date(record.clickedAt).getTime()) / 1000;
      if (diffSeconds < 10) {
        return res.status(400).json({ message: "VERIFICATION_FAILED_TIME", details: `Wait at least ${Math.ceil(10 - diffSeconds)} more seconds.` });
      }

      // Secret code verification (case-insensitive)
      if (task.secretCode && task.secretCode.toUpperCase() !== (code || "").toUpperCase()) {
        return res.status(400).json({ message: "VERIFICATION_FAILED_CODE", details: "The secret code entered is incorrect." });
      }

      // Rank gate: Engine B requires C-Rank minimum (spec B.2)
      const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];
      const DIFFICULTY_MIN: Record<string, string> = { Easy: "E-Rank", Medium: "D-Rank", Hard: "C-Rank", Elite: "A-Rank" };
      const taskUser = await storage.getUserById(userId);
      const userTierIdx = RANK_ORDER.indexOf(taskUser?.userRankTier || "E-Rank");
      const diffMinRank = DIFFICULTY_MIN[task.difficulty || "Easy"] ?? "E-Rank";
      if (userTierIdx < RANK_ORDER.indexOf(diffMinRank)) {
        return res.status(403).json({ error: "RANK_GATE", requiredRank: diffMinRank, message: `This task requires ${diffMinRank} or higher.` });
      }
      // CPA always requires C-Rank minimum
      if (userTierIdx < RANK_ORDER.indexOf("C-Rank")) {
        return res.status(403).json({ error: "RANK_GATE", requiredRank: "C-Rank", message: "Engine B CPA tasks require C-Rank or higher." });
      }

      // Atomic: complete record + earn event in one transaction.
      // The UPDATE is guarded by WHERE status = "pending": if a concurrent verify
      // already completed this record between our read and our write (double-click,
      // client retry race), the guarded UPDATE affects 0 rows and we return the
      // idempotent "already completed" response instead of double-crediting or
      // surfacing a 500 (uniq_user_transactions_source stays as the DB backstop).
      let updatedRecord: any;
      let thorxCard: { pointsCredited: number; engineType: string } | null = null;
      let alreadyCompleted = false;
      try {
        await db.transaction(async (tx) => {
          [updatedRecord] = await tx
            .update(engineBRecords)
            .set({ status: "completed", completedAt: new Date() })
            .where(and(eq(engineBRecords.id, record.id), eq(engineBRecords.status, "pending")))
            .returning();

          if (!updatedRecord) {
            alreadyCompleted = true;
            return;
          }

          const earnResult = await storage.recordEarnEvent({
            userId,
            engineType: "Engine_B",
            grossPkr: new Decimal(task.grossPkrPerCompletion).toNumber(),
            sourceId: updatedRecord?.id ?? taskId,
            sourceType: "engine_b_task",
            tx,
          });
          if (earnResult.pointsCredited > 0) {
            thorxCard = { pointsCredited: earnResult.pointsCredited, engineType: "Engine_B" };
          }
        });
      } catch (err) {
        logger.error({ err }, "[engine-b/verify] atomic transaction failed:");
        return res.status(500).json({ message: "Verification failed" });
      }

      if (alreadyCompleted) {
        return res.json({ message: "Task already completed", record });
      }
      res.json({ success: true, record: updatedRecord, thorxCard });
    } catch (error) {
      res.status(500).json({ message: "Verification failed" });
    }
  });


  app.patch("/api/hilltopads/config/:id", requireTeamRole, async (req, res) => {
    try {
      const { id } = req.params;
      // Validate and strip unknown keys — prevents mass-assignment against the config table.
      const updates = insertHilltopAdsConfigSchema.partial().parse(req.body);

      const config = await storage.updateHilltopAdsConfig(id, updates);

      if (!config) {
        return res.status(404).json({ message: "Config not found" });
      }

      try {
        // apiKey is a secret — record that it changed, never its value.
        const redactedUpdates = 'apiKey' in updates ? { ...updates, apiKey: '[REDACTED]' } : updates;
        await storage.createAuditLog({
          adminId: req.userProfile?.id as string,
          actorRole: req.userProfile?.role,
          action: "HILLTOPADS_CONFIG_UPDATED",
          targetType: "system",
          targetId: id,
          details: { updatedFields: Object.keys(updates), values: redactedUpdates },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (HILLTOPADS_CONFIG_UPDATED):");
      }

      res.json(config);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid config fields", error: (error as any).errors });
      }
      logger.error({ err: error }, "Update HilltopAds config error:");
      res.status(500).json({ message: "Failed to update config", error: "INTERNAL_ERROR" });
    }
  });

  // HilltopAds Zones Routes (Team/Founder only)
  app.post("/api/hilltopads/zones", requireTeamRole, async (req, res) => {
    try {
      const { zoneId, siteName, zoneName, adFormat, settings } = req.body;

      if (!zoneId || !siteName || !zoneName || !adFormat) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const zone = await storage.createHilltopAdsZone({
        zoneId,
        siteName,
        zoneName,
        adFormat,
        status: "active",
        settings: settings || {}
      });

      try {
        await storage.createAuditLog({
          adminId: req.userProfile?.id as string,
          actorRole: req.userProfile?.role,
          action: "HILLTOPADS_ZONE_CREATED",
          targetType: "system",
          targetId: zone.id,
          details: { zoneId, siteName, zoneName, adFormat },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (HILLTOPADS_ZONE_CREATED):");
      }

      res.json(zone);
    } catch (error) {
      logger.error({ err: error }, "Create HilltopAds zone error:");
      res.status(500).json({ message: "Failed to create zone", error: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/hilltopads/zones", requireTeamRole, async (req, res) => {
    try {
      const zones = await storage.getHilltopAdsZones();
      res.json(zones);
    } catch (error) {
      logger.error({ err: error }, "Get HilltopAds zones error:");
      res.status(500).json({ message: "Failed to fetch zones", error: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/hilltopads/zones/:zoneId", requireTeamRole, async (req, res) => {
    try {
      const { zoneId } = req.params;
      const zone = await storage.getHilltopAdsZoneById(zoneId);

      if (!zone) {
        return res.status(404).json({ message: "Zone not found" });
      }

      res.json(zone);
    } catch (error) {
      logger.error({ err: error }, "Get HilltopAds zone error:");
      res.status(500).json({ message: "Failed to fetch zone", error: "INTERNAL_ERROR" });
    }
  });

  app.patch("/api/hilltopads/zones/:id", requireTeamRole, async (req, res) => {
    try {
      const { id } = req.params;
      // Validate and strip unknown keys — prevents mass-assignment against the zones table.
      const updates = insertHilltopAdsZoneSchema.partial().parse(req.body);

      const zone = await storage.updateHilltopAdsZone(id, updates);

      if (!zone) {
        return res.status(404).json({ message: "Zone not found" });
      }

      try {
        await storage.createAuditLog({
          adminId: req.userProfile?.id as string,
          actorRole: req.userProfile?.role,
          action: "HILLTOPADS_ZONE_UPDATED",
          targetType: "system",
          targetId: id,
          details: { updatedFields: Object.keys(updates), values: updates },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (HILLTOPADS_ZONE_UPDATED):");
      }

      res.json(zone);
    } catch (error) {
      if (error instanceof Error && error.name === "ZodError") {
        return res.status(400).json({ message: "Invalid zone fields", error: (error as any).errors });
      }
      logger.error({ err: error }, "Update HilltopAds zone error:");
      res.status(500).json({ message: "Failed to update zone", error: "INTERNAL_ERROR" });
    }
  });

  // HilltopAds Statistics Routes (Team/Founder only)
  app.get("/api/hilltopads/stats", requireTeamRole, async (req, res) => {
    try {
      const { zoneId, startDate, endDate } = req.query;

      const start = startDate ? new Date(startDate as string) : undefined;
      const end = endDate ? new Date(endDate as string) : undefined;

      const stats = await storage.getHilltopAdsStats(
        zoneId as string | undefined,
        start,
        end
      );

      res.json(stats);
    } catch (error) {
      logger.error({ err: error }, "Get HilltopAds stats error:");
      res.status(500).json({ message: "Failed to fetch stats", error: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/hilltopads/revenue", requireTeamRole, async (req, res) => {
    try {
      const totalRevenue = await storage.getTotalHilltopAdsRevenue();
      res.json({ totalRevenue });
    } catch (error) {
      logger.error({ err: error }, "Get HilltopAds revenue error:");
      res.status(500).json({ message: "Failed to fetch revenue", error: "INTERNAL_ERROR" });
    }
  });

  // HilltopAds Ad Completion Tracking (Authenticated users)
  //
  // Engine A hardening (2026-08): this endpoint is now a NO-CREDIT reporting
  // stub. It previously called storage.createAdView with completed:true +
  // earnedAmount, which auto-credits via recordEarnEvent — an unratelimited,
  // unchecked path a logged-in user could POST in a loop to mint unlimited
  // points/PKR (the ad-completion money faucet). All Engine A credit now
  // flows exclusively through POST /api/ad-view (session auth +
  // earnRateLimiter + timing gap + daily cap + advisory lock). The stub logs
  // a completed:false row for analytics; real network-completion reporting
  // returns with the Phase 2 network-adapter layer.
  app.post("/api/hilltopads/ad-completion", requireSessionAuth, async (req, res) => {
    try {
      const { zoneId, adType, duration } = req.body;
      const userId = req.userProfile.id;

      if (!zoneId || !adType) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Create ad view record
      let rewardAmount = "0.10"; // Default fallback

      try {
        const config = await storage.getHilltopAdsConfig();
        if (config && config.settings && (config.settings as any).rewardPerAd) {
          rewardAmount = (config.settings as any).rewardPerAd;
        }
      } catch (e) {
        logger.error({ err: e }, "Failed to fetch hilltop ads config for reward amount");
      }

      const adView = await storage.createAdView({
        userId,
        adType,
        adNetwork: "hilltopads",
        duration: duration || 0,
        completed: false,
        earnedAmount: "0"
      });

      res.json({
        success: true,
        adView,
        message: "Ad completion recorded"
      });
    } catch (error) {
      logger.error({ err: error }, "HilltopAds ad completion error:");
      res.status(500).json({ message: "Failed to record ad completion", error: "INTERNAL_ERROR" });
    }
  });

  // HilltopAds Sync Endpoints (Team/Founder only)
  app.post("/api/hilltopads/sync/inventory", requireTeamRole, async (req, res) => {
    try {
      await hilltopAdsService.syncInventory();
      res.json({ success: true, message: "Inventory synced successfully" });
    } catch (error) {
      logger.error({ err: error }, "Sync inventory error:");
      res.status(500).json({ message: "Failed to sync inventory", error: "INTERNAL_ERROR" });
    }
  });

  app.post("/api/hilltopads/sync/stats", requireTeamRole, async (req, res) => {
    try {
      const { startDate, endDate } = req.body;
      await hilltopAdsService.syncStats(startDate, endDate);
      res.json({ success: true, message: "Stats synced successfully" });
    } catch (error) {
      logger.error({ err: error }, "Sync stats error:");
      res.status(500).json({ message: "Failed to sync stats", error: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/hilltopads/balance", requireTeamRole, async (req, res) => {
    try {
      const balance = await hilltopAdsService.getBalance();
      res.json({ balance });
    } catch (error) {
      logger.error({ err: error }, "Get balance error:");
      res.status(500).json({ message: "Failed to fetch balance", error: "INTERNAL_ERROR" });
    }
  });

  app.get("/api/hilltopads/anti-adblock/:zoneId", async (req, res) => {
    try {
      const { zoneId } = req.params;
      const code = await hilltopAdsService.getAntiAdBlockCode(zoneId);
      res.json({ code });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // If API key is not configured, return an empty code so the client
      // waterfalls to the next ad network rather than surfacing a 500.
      if (msg.includes("not configured")) {
        return res.json({ code: "" });
      }
      logger.error({ err: error }, "Get anti-adblock code error:");
      res.status(500).json({ message: "Failed to fetch anti-adblock code", error: "INTERNAL_ERROR" });
    }
  });

  // Zero-Trust Team Key Management (Admin/Founder only)
  app.get("/api/team/members", requirePermission("MANAGE_TEAM"), async (req, res) => {
    try {
      const records = await storage.getTeamMembers();
      const members = records.map(record => ({
        id: record.id,
        name: `${record.firstName} ${record.lastName}`.trim(),
        email: record.email,
        accessLevel: record.role, // 'founder', 'admin', 'team'
        // users.permissions is the field actually enforced by requirePermission —
        // team_keys.permissions is kept as a mirror but must never be the source of
        // truth for what's displayed here, or the UI can show grants that don't work.
        permissions: (record.permissions as string[] | null) || [],
        isActive: record.isActive,
        lastUsed: record.lastLoginDate?.toISOString() || null // Used for Activity Monitoring
      }));
      res.json({ members });
    } catch (e) {
      res.status(500).json({ message: "Failed to compile access matrix" });
    }
  });

  app.post("/api/team/members", requirePermission("MANAGE_TEAM"), adminActionRateLimiter, async (req, res) => {
    try {
      if (!req.userProfile) return res.status(401).send();
      const teamMemberSchema = z.object({
        email: z.string().email(),
        role: z.enum(["admin", "team"]),
        permissions: z.array(z.string().max(50)).max(20).optional(),
      });
      const parsedMember = teamMemberSchema.safeParse(req.body);
      if (!parsedMember.success) return res.status(400).json({ message: parsedMember.error.errors[0]?.message ?? "Invalid input" });
      const { email, role, permissions } = parsedMember.data;
      const isAdminOrFounder = req.userProfile.role === 'founder' || req.userProfile.role === 'admin';
      
      if (!isAdminOrFounder) return res.status(403).json({ message: "Insufficient authorization level to issue keys." });

      // Find node securely using raw SQL mapping to the existing users table via drizzle
      // Targeted lookup by email — avoids loading the entire users table into memory.
      const targetUser = await storage.getUserByEmail(email.toLowerCase());

      if (!targetUser) {
        return res.status(404).json({ message: "Target email does not belong to any active ecosystem element." });
      }

      // Hardcoded Peer Governance rule (Open Question resolution: Peer deletion restriction)
      if (targetUser.role === 'founder' && req.userProfile.role !== 'founder') {
        return res.status(403).json({ message: "System override blocked: Cannot control Founder nodes." });
      }

      // Only founders can elevate a role to admin or founder level
      if (role && ['admin', 'founder'].includes(role) && req.userProfile.role !== 'founder') {
        return res.status(403).json({ message: "Only founders can assign admin or founder roles." });
      }

      const grantedPermissions = role === 'team' ? (permissions || []) : [];

      // Role + key + effective-permissions writes must land together — if the key
      // write failed after the role write, the user would be promoted without a
      // matching key record (or vice versa).
      await db.transaction(async (tx) => {
        // 1. Elevate Privilege Level. users.permissions is the column requirePermission()
        // actually reads, so it must be updated in the same step as the role.
        await tx.update(users).set({ role, permissions: grantedPermissions }).where(eq(users.id, targetUser.id));

        // 2. Issue Cryptographic Entry Key (mirrors the effective permissions for display).
        await storage.createTeamKey({
          userId: targetUser.id,
          keyName: `AUTH-TOKEN-${Date.now()}`,
          accessLevel: role,
          permissions: grantedPermissions,
        }, tx);
      });

      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: "TEAM_MEMBER_ADDED",
        targetType: "system",
        targetId: targetUser.id,
        details: { email: targetUser.email, role, permissions: grantedPermissions },
      }, getRequestContext(req));

      broadcastUserUpdated(targetUser.id, "team_privileges_updated");
      broadcastTeamRefresh("team_member_added");
      res.json({ success: true, message: "Cryptographic Key successfully minted." });
    } catch (error) {
       logger.error({ err: error }, "Team key creation error:");
       res.status(500).json({ message: "Failed to mint key." });
    }
  });

  app.patch("/api/team/members/:id", requirePermission("MANAGE_TEAM"), adminActionRateLimiter, async (req, res) => {
    try {
      if (!req.userProfile) return res.status(401).send();
      const patchMemberSchema = z.object({
        accessLevel: z.enum(["admin", "team"]).optional(),
        isActive: z.boolean().optional(),
      });
      const parsedPatch = patchMemberSchema.safeParse(req.body);
      if (!parsedPatch.success) return res.status(400).json({ message: parsedPatch.error.errors[0]?.message ?? "Invalid input" });
      const { id } = req.params;
      const { accessLevel, isActive } = parsedPatch.data;

      // Only admin or founder can modify team member records
      const actorRole = req.userProfile.role;
      const isAdminOrFounder = actorRole === 'founder' || actorRole === 'admin';
      if (!isAdminOrFounder) {
        return res.status(403).json({ message: "Insufficient authorization to modify team members." });
      }

      // Nobody can deactivate or demote their own account through this panel —
      // prevents an admin from accidentally locking themselves out.
      if (id === req.userProfile.id) {
        return res.status(400).json({ message: "You cannot modify your own access level or status." });
      }

      // Only founders can elevate a role to admin or founder level
      if (accessLevel && ['admin', 'founder'].includes(accessLevel) && actorRole !== 'founder') {
        return res.status(403).json({ message: "Only founders can assign admin or founder roles." });
      }

      const targetUser = await storage.getUserById(id);

      if (!targetUser) return res.status(404).json({ message: "Target node detached." });

      // Founders are immutable by non-founders
      if (targetUser.role === 'founder' && actorRole !== 'founder') {
        return res.status(403).json({ message: "Founding nodes cannot be altered." });
      }

      const oldRole = targetUser.role;
      const oldIsActive = targetUser.isActive;

      await db.transaction(async (tx) => {
        const updates: any = {};
        if (accessLevel) updates.role = accessLevel;
        if (isActive !== undefined) updates.isActive = isActive;

        await tx.update(users).set(updates).where(eq(users.id, id));

        // Synchronize associated key
        if (accessLevel || isActive !== undefined) {
          const existingKeys = await storage.getTeamKeysByUser(id, tx);
          if (existingKeys.length > 0) {
            const keyUpdates: any = {};
            if (accessLevel) keyUpdates.accessLevel = accessLevel;
            if (isActive !== undefined) keyUpdates.isActive = isActive;
            await tx.update(teamKeys).set({ ...keyUpdates, updatedAt: new Date() }).where(eq(teamKeys.id, existingKeys[0].id));
          }
        }
      });

      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: "TEAM_MEMBER_UPDATED",
        targetType: "system",
        targetId: id,
        details: { email: targetUser.email, oldRole, newRole: accessLevel ?? oldRole, oldIsActive, newIsActive: isActive ?? oldIsActive },
      }, getRequestContext(req));

      broadcastUserUpdated(id, "team_privileges_updated");
      broadcastTeamRefresh("team_member_updated");
      res.json({ success: true, message: "Matrix privileges updated." });
    } catch (e) {
      logger.error({ err: e }, "Matrix privileges update failed");
      res.status(500).json({ message: "Modification failed." });
    }
  });

  // Manually override a user's PS-based rank tier (E-Rank → S-Rank).
  // Sets userRankTier directly and optionally locks it so PS changes do not override it.
  app.patch("/api/admin/users/:id/rank", requirePermission("MANAGE_USERS"), profileRateLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const RANK_TIERS = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"] as const;
      const rankSchema = z.object({
        rank: z.enum(RANK_TIERS),
        locked: z.boolean().optional(),
      });
      const parsedRank = rankSchema.safeParse(req.body);
      if (!parsedRank.success) return res.status(400).json({ message: parsedRank.error.errors[0]?.message ?? "Invalid input" });
      const { rank, locked } = parsedRank.data;

      const targetUser = await storage.getUserById(id);
      if (!targetUser) return res.status(404).json({ message: "User not found" });
      const oldTier = targetUser.userRankTier || "E-Rank";

      const [updatedUser] = await db
        .update(users)
        .set({
          userRankTier: rank,
          // The `locked` flag was accepted by the schema but never applied — a
          // locked rank save returned success while rankLocked stayed false, so
          // the user's very next earn event silently reverted the manual rank.
          // Only write it when provided so locked:false (explicit unlock) and an
          // omitted field behave differently.
          ...(locked !== undefined ? { rankLocked: locked } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, id))
        .returning();

      // Audit parity with the PS engine: automatic rank changes write a
      // rank_logs row (triggerSource 'ps_engine'); manual overrides must be
      // traceable the same way instead of appearing out of nowhere.
      await db.insert(rankLogs).values({
        userId: id,
        oldRank: oldTier,
        newRank: rank,
        triggerSource: "admin",
        targetType: "user",
      });

      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: "RANK_TIER_MANUALLY_SET",
        targetType: "user",
        targetId: id,
        details: { oldTier, newTier: rank, locked: !!locked },
      }, getRequestContext(req));

      broadcastUserUpdated(id, "rank_updated", { oldRank: oldTier, newRank: rank });
      res.json(sanitizeUser(updatedUser));
    } catch (error) {
      logger.error({ err: error }, "Manual rank tier update error:");
      res.status(500).json({ message: "Failed to update rank tier" });
    }
  });

  // Set (or clear) a user's Trust Status — an admin-assigned account
  // classification surfaced on the Leaderboard. A reason is mandatory
  // whenever a status is being set (not required when clearing to null).
  app.patch("/api/admin/users/:id/trust-status", requirePermission("MANAGE_USERS"), adminActionRateLimiter, async (req, res) => {
    try {
      const { id } = req.params;
      const trustSchema = z.object({
        status: z.enum(TRUST_STATUSES).nullable(),
        reason: z.string().max(500).optional(),
      });
      const parsedTrust = trustSchema.safeParse(req.body);
      if (!parsedTrust.success) return res.status(400).json({ message: parsedTrust.error.errors[0]?.message ?? "Invalid input" });
      const { status, reason } = parsedTrust.data;
      if (status !== null && (!reason || !reason.trim())) {
        return res.status(400).json({ message: "A reason is required when setting a trust status." });
      }

      const targetUser = await storage.getUserById(id);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const safeReason = reason?.trim() ?? "";
      const updatedUser = await storage.setUserTrustStatus(id, status ?? "", status === null ? "" : safeReason, req.userProfile.id);

      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: "TRUST_STATUS_SET",
        targetType: "user",
        targetId: id,
        details: { oldStatus: targetUser.trustStatus || null, newStatus: status, reason: status === null ? null : safeReason },
      }, getRequestContext(req));

      broadcastUserUpdated(id, "trust_status_updated");
      res.json(sanitizeUser(updatedUser));
    } catch (error) {
      logger.error({ err: error }, "Trust status update error:");
      res.status(500).json({ message: "Failed to update trust status" });
    }
  });

  app.patch("/api/team/members/:id/permissions", requirePermission("MANAGE_TEAM"), adminActionRateLimiter, async (req, res) => {
    try {
      if (!req.userProfile) return res.status(401).send();
      // Consistent with the other 4 team-key routes: any admin-or-founder
      // holding MANAGE_TEAM can act, not founders exclusively. Previously this
      // route hard-blocked admins even though they can already set initial
      // permissions via POST /api/team/members — that dead-end (admin could
      // create but never edit) is what this aligns.
      const actorRole = req.userProfile.role;
      if (actorRole !== 'founder' && actorRole !== 'admin') {
        return res.status(403).json({ message: "Insufficient authorization to modify access permissions." });
      }

      const { id } = req.params;
      let permissions: string[];
      try {
        ({ permissions } = z.object({ permissions: z.array(z.string()) }).parse(req.body));
      } catch (e: any) {
        return res.status(400).json({ message: e?.errors?.[0]?.message ?? "Permissions must be an array of structural identifiers." });
      }

      const targetUser = await storage.getUserById(id);
      if (!targetUser) return res.status(404).json({ message: "Target node detached." });

      // Founders are immutable by non-founders (mirrors PATCH /:id and DELETE).
      if (targetUser.role === 'founder' && actorRole !== 'founder') {
        return res.status(403).json({ message: "Founding nodes cannot be altered." });
      }

      const existingKeys = await storage.getTeamKeysByUser(id);
      if (existingKeys.length === 0) {
        return res.status(404).json({ message: "No active key found for this node. Issue a key first." });
      }

      // Update both stores together: team_keys.permissions drives the UI, but
      // users.permissions is what requirePermission() actually enforces. Writing
      // only one meant granting access here had zero effect on real authorization.
      await db.transaction(async (tx) => {
        await tx.update(teamKeys).set({ permissions, updatedAt: new Date() }).where(eq(teamKeys.id, existingKeys[0].id));
        await tx.update(users).set({ permissions }).where(eq(users.id, id));
      });

      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: "TEAM_PERMISSIONS_UPDATED",
        targetType: "system",
        targetId: id,
        details: { email: targetUser.email, newPermissions: permissions },
      }, getRequestContext(req));

      broadcastUserUpdated(id, "team_permissions_updated");
      broadcastTeamRefresh("team_permissions_updated");
      res.json({ success: true, message: "Node access matrix reconfigured." });
    } catch (e) {
      logger.error({ err: e }, "Matrix reconfiguration failed");
      res.status(500).json({ message: "Matrix reconfiguration failed." });
    }
  });

  app.delete("/api/team/members/:id", requirePermission("MANAGE_TEAM"), async (req, res) => {
    try {
      if (!req.userProfile) return res.status(401).send();
      const { id } = req.params;

      // Only admin or founder can remove team members
      const actorRole = req.userProfile.role;
      if (actorRole !== 'founder' && actorRole !== 'admin') {
        return res.status(403).json({ message: "Insufficient authorization to remove team members." });
      }

      // Nobody can revoke their own access — prevents accidental self-lockout
      // (e.g. the last founder deleting themselves).
      if (id === req.userProfile.id) {
        return res.status(400).json({ message: "You cannot revoke your own access." });
      }

      const targetUser = await storage.getUserById(id);

      if (!targetUser) return res.status(404).json({ message: "Node missing." });
      if (targetUser.role === 'founder' && actorRole !== 'founder') {
         return res.status(403).json({ message: "Founders are immutable." });
      }

      // Demote node, clear granted permissions, and wipe session keys completely from the DB
      await db.transaction(async (tx) => {
        await tx.update(users).set({ role: 'user', permissions: [] }).where(eq(users.id, id));
        await tx.delete(teamKeys).where(eq(teamKeys.userId, id));
      });

      await storage.createAuditLog({
        adminId: req.userProfile.id,
        actorRole: req.userProfile?.role,
        action: "TEAM_KEY_REVOKED",
        targetType: "system",
        targetId: id,
        details: { email: targetUser.email, originalRole: targetUser.role },
      }, getRequestContext(req));

      res.json({ success: true, message: "Node detached and wiped." });
    } catch (e) {
      logger.error({ err: e }, "Team member removal failed");
      res.status(500).json({ message: "Operation failed." });
    }
  });

  // Authenticated system config read — only allow specific public keys without auth
  // C-05: Rate-limited and auth-gated system config lookup.
  app.get("/api/system-config/:key", publicApiRateLimiter, async (req, res) => {
    try {
      const SYSTEM_PUBLIC_KEYS = new Set(["MIN_PAYOUT"]);
      const key = req.params.key;

      if (!SYSTEM_PUBLIC_KEYS.has(key)) {
        const principalId = getThorxPrincipalId(req);
        if (!principalId) {
          return res.status(401).json({ message: "Authentication required" });
        }
      }

      const config = await storage.getSystemConfig(key);
      if (!config) return res.status(404).json({ message: "Config not found" });
      res.json(config);
    } catch (error) {
      logger.error({ err: error, key: req.params.key }, "Error fetching system-config");
      res.status(500).json({ message: "Failed to fetch config" });
    }
  });

  // System Settings audit (2026-07-29): POST /api/admin/system-config was a
  // dead, unused-by-frontend duplicate of PATCH /api/admin/config/:key with
  // weaker validation (value capped to a 500-char string, so it would 400/500
  // on the JSON-array configs like AD_NETWORKS/CPA_NETWORKS). Removed to stop
  // it from silently drifting further out of sync with the real endpoint.

  app.get("/api/admin/system-config/:key", requireTeamRole, async (req, res) => {
    try {
      const config = await storage.getSystemConfig(req.params.key);
      if (!config) return res.status(404).json({ message: "Config not found" });
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch config" });
    }
  });

  // ─── Risk Case Management API ──────────────────────────────────────────────

  app.get("/api/admin/risk-cases", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const { severity, status, search, limit = "50", offset = "0", sortDir } = req.query as Record<string, string>;
      const result = await storage.listRiskCases({
        severity: severity || undefined,
        status: status || undefined,
        search: search || undefined,
        limit: parseInt(limit),
        offset: parseInt(offset),
        sortDir: sortDir === "asc" ? "asc" : "desc",
      });
      res.json(result);
    } catch (err) {
      logger.error({ err: err }, "[RiskCases] listRiskCases error:");
      res.status(500).json({ message: "Failed to load risk cases" });
    }
  });

  app.get("/api/admin/risk-cases/signal-stats", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const stats = await storage.getRiskSignalStats();
      res.json(stats);
    } catch (err) {
      logger.error({ err: err }, "[RiskCases] getRiskSignalStats error:");
      res.status(500).json({ message: "Failed to load signal stats" });
    }
  });

  app.get("/api/admin/risk-cases/:id", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const riskCase = await storage.getRiskCase(req.params.id);
      if (!riskCase) return res.status(404).json({ message: "Case not found" });
      res.json(riskCase);
    } catch (err) {
      logger.error({ err: err }, "[RiskCases] getRiskCase error:");
      res.status(500).json({ message: "Failed to load case" });
    }
  });

  app.patch("/api/admin/risk-cases/:id", requirePermission("MANAGE_USERS"), adminActionRateLimiter, async (req, res) => {
    try {
      const riskCaseUpdateSchema = z.object({
        status:             z.enum(["Open", "Investigating", "Cleared", "Actioned"]).optional(),
        assignedTo:         z.string().uuid().nullable().optional(),
        notes:              z.string().max(5000).optional(),
        resolution:         z.string().max(1000).optional(),
        trustStatusOutcome: z.enum(TRUST_STATUSES).optional(),
      });
      const parsed = riskCaseUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { status, assignedTo, notes, resolution, trustStatusOutcome } = parsed.data;
      const adminId = getThorxPrincipalId(req);

      // Stamp note attribution so team members can see who last wrote the notes and when
      const updates: any = {
        assignedTo: assignedTo !== undefined ? (assignedTo || null) : undefined,
      };
      if (notes !== undefined) {
        updates.notes = notes;
        updates.notesBy = adminId;
        updates.notesUpdatedAt = new Date();
      }
      if (status) {
        updates.status = status;
        if (status === "Cleared" || status === "Actioned") {
          updates.resolvedBy = adminId;
          updates.resolvedAt = new Date();
          updates.resolution = resolution || `${status} by admin`;
        }
      }

      // updateRiskCase now throws "Risk case not found" if the ID doesn't match
      // any row, which surfaces as a clean 400 rather than a cryptic 500.
      const updated = await storage.updateRiskCase(req.params.id, updates);

      // ── Audit log — every risk case update is recorded ───────────────────
      // This was previously absent, leaving no trace of who changed status,
      // assignment, or notes. All risk-case decisions must be auditable.
      await storage.createAuditLog({
        adminId: adminId as string,
        actorRole: req.userProfile?.role,
        action: "RISK_CASE_UPDATED",
        targetType: "user",
        targetId: updated.userId,
        details: {
          riskCaseId: updated.id,
          ...(status        && { statusChange: status }),
          ...(assignedTo !== undefined && { assignedTo: assignedTo ?? null }),
          ...(notes !== undefined      && { notesUpdated: true }),
          ...(resolution               && { resolution }),
          ...(trustStatusOutcome       && { trustStatusOutcome }),
        },
      }, getRequestContext(req));

      // ── Trust Status outcome ─────────────────────────────────────────────
      // Trust Status is the resolution of a risk case: an admin investigates
      // a case, then the outcome (Cleared/Actioned) can set the account's
      // Trust Status, logged with the case resolution as the "why".
      // Previously, failures were silently swallowed (caught + only logged),
      // so admins received a "Case updated" success toast even when the trust
      // status change never applied. Now we surface the failure in the response
      // so the frontend can show a targeted warning.
      let trustStatusApplied = false;
      let trustStatusError: string | null = null;
      if (trustStatusOutcome && adminId && (status === "Cleared" || status === "Actioned")) {
        if ((TRUST_STATUSES as readonly string[]).includes(trustStatusOutcome)) {
          try {
            await storage.setUserTrustStatus(
              updated.userId,
              trustStatusOutcome,
              `Risk case ${status.toLowerCase()}: ${resolution || `${status} by admin`}`,
              adminId
            );
            trustStatusApplied = true;
          } catch (trustErr) {
            logger.error({ err: trustErr }, "[RiskCases] setUserTrustStatus error:");
            trustStatusError = trustErr instanceof Error ? trustErr.message : "Trust status update failed";
          }
        }
      }

      res.json({
        ...updated,
        // Include these fields only when a trust status change was attempted
        // so the frontend can show a targeted warning if it silently failed.
        ...(trustStatusOutcome ? { trustStatusApplied, trustStatusError } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update case";
      // updateRiskCase throws "Risk case not found" — surface as 404 not 500
      const statusCode = msg === "Risk case not found" ? 404 : 500;
      logger.error({ err }, "[RiskCases] updateRiskCase error:");
      res.status(statusCode).json({ message: msg });
    }
  });

  app.post("/api/admin/risk-scan", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req);
      const { runFullRiskScan } = await import("./modules/risk-engine");
      // Audit finding (Risk Watchlist, 2026-07-30): refreshLeaderboardCache() must run
      // BEFORE runFullRiskScan(), matching the recurring cron's order (below, ~line 742).
      // runFullRiskScan()'s backfillLatestRiskScore() stamps the real score onto each
      // user's MOST RECENT score_history snapshot. Calling the scan first meant the
      // cache refresh that followed created a brand-new snapshot with a "0" placeholder
      // that never got backfilled until the next cron tick — admins saw every user's
      // risk score visibly flash to zero immediately after a manual scan.
      await storage.refreshLeaderboardCache();
      const result = await runFullRiskScan({ broadcastAlerts: true });

      // ── Audit log — full risk scans affect every user's risk score ───────
      // Previously unlogged; admins had no record of who triggered scans or
      // how many users were flagged/critical at each point in time.
      await storage.createAuditLog({
        adminId: adminId as string,
        actorRole: req.userProfile?.role,
        action: "RISK_SCAN_TRIGGERED",
        targetType: "system",
        targetId: "risk_engine",
        details: { scanned: (result as any).scanned, flagged: (result as any).flagged, critical: (result as any).critical },
      }, getRequestContext(req));

      res.json({ ok: true, ...result });
    } catch (err) {
      logger.error({ err: err }, "[RiskCases] runFullRiskScan error:");
      res.status(500).json({ message: "Risk scan failed" });
    }
  });

  app.get("/api/admin/risk-cases/user/:userId/score-history", requirePermission("VIEW_ANALYTICS"), async (req, res) => {
    try {
      const history = await storage.getScoreHistory(req.params.userId, 30);
      res.json(history);
    } catch (err) {
      logger.error({ err: err }, "[RiskCases] getScoreHistory error:");
      res.status(500).json({ message: "Failed to load score history" });
    }
  });

  // ── THORX v3 (spec E.9): Guild application flow ────────────────────────────
  app.get("/api/guilds/:id/application-status", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const application = await storage.getGuildApplicationStatus(userId);
      res.json({ application: application ?? null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch application status" });
    }
  });

  // Engine C: the current user's pending guild application — lets the
  // Discovery panel keep its "Applied" state stable across page loads.
  app.get("/api/guilds/my-application", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const application = await storage.getGuildApplicationStatus(userId);
      res.json({ application: application ?? null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch application status" });
    }
  });

  app.post("/api/guilds/:id/apply", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const { coverLetter } = req.body;
      if (!coverLetter || typeof coverLetter !== "string" || coverLetter.trim().length < 50) {
        return res.status(400).json({ message: "Cover letter must be at least 50 characters." });
      }
      if (coverLetter.trim().length > 1000) {
        return res.status(400).json({ message: "Cover letter cannot exceed 1000 characters." });
      }
      const membership = await storage.applyToGuildWithCoverLetter(req.params.id, userId, coverLetter.trim());
      broadcastGuildEvent(req.params.id, 'guild.application_received', { userId, guildId: req.params.id });
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_APPLICATION_SUBMITTED",
          targetType: "guild_application",
          targetId: membership.id,
          details: { guildId: req.params.id },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_APPLICATION_SUBMITTED):");
      }
      res.status(201).json({ membership });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to submit guild application";
      res.status(400).json({ message: msg });
    }
  });

  app.patch("/api/guilds/:id/applications/:applicationId", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      const guildAppSchema = z.object({
        action: z.enum(["accept", "reject"]),
        rejectionReason: z.string().max(500).optional(),
      });
      const parsedApp = guildAppSchema.safeParse(req.body);
      if (!parsedApp.success) return res.status(400).json({ message: parsedApp.error.errors[0]?.message ?? "Invalid input" });
      const { action, rejectionReason } = parsedApp.data;
      const membership = await storage.decideGuildApplication(
        req.params.id, req.params.applicationId, captainId, action, rejectionReason
      );
      // Notify the applicant personally + entire guild of the decision
      if (membership?.userId) {
        broadcastToUser(membership.userId, 'guild.application_decided', { action, guildId: req.params.id });
      }
      broadcastGuildEvent(req.params.id, 'guild.application_decided_notify', { action, guildId: req.params.id });
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_APPLICATION_DECIDED",
          targetType: "guild_application",
          targetId: req.params.applicationId,
          details: { decision: action === "accept" ? "approved" : "rejected", applicantUserId: membership?.userId, rejectionReason },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_APPLICATION_DECIDED):");
      }
      res.json({ membership });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to decide application";
      res.status(400).json({ message: msg });
    }
  });

  // Pending join applications — captain or an assistant with the
  // join_applications permission. (The roster endpoint only returns active
  // members, so pending applications need their own listing.)
  app.get("/api/guilds/:id/applications", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const guild = await storage.getGuildById(req.params.id);
      if (!guild) return res.status(404).json({ message: "Guild not found" });
      const role = req.userProfile?.role;
      const isTeam = role === "team" || role === "founder" || role === "admin";
      const assistantCanDecide = guild.assistantCaptainId === userId &&
        (guild.assistantPermissions as string[] | null)?.includes("join_applications");
      if (!isTeam && guild.captainId !== userId && !assistantCanDecide) {
        return res.status(403).json({ message: "Only the captain or an authorized assistant can view applications." });
      }
      const applications = await storage.listPendingGuildApplications(req.params.id);
      res.json({
        applications: applications.map((a: any) => ({
          ...a,
          createdAt: a.requestedAt ?? null,
          avatarUrl: a.profilePicture ??
            (typeof a.avatar === "string" && a.avatar.startsWith("avatar-") ? `/avatars/${a.avatar}.png` : null),
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch applications" });
    }
  });

  // Shared guard for player-facing guild-roster routes (captain/member portal +
  // weekly history). Visible to: team/founder/admin (moderation), the guild's
  // own active members (their own roster), and anyone previewing a *public*
  // guild (Guild Discovery lets a prospective applicant see the roster before
  // applying — see GuildDiscoveryPanel.tsx). A private, non-member guild's
  // roster/history must stay hidden even though the route only requires login.
  async function assertGuildRosterVisible(req: Request, guildId: string): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    const guild = await storage.getGuildById(guildId);
    if (!guild) return { ok: false, status: 404, message: "Guild not found" };
    const role = req.userProfile?.role;
    if (role === "team" || role === "founder" || role === "admin") return { ok: true };
    if (guild.isPublic) return { ok: true };
    const userId = getThorxPrincipalId(req) as string | undefined;
    const isMember = userId ? await storage.isActiveGuildMember(guildId, userId) : false;
    if (isMember) return { ok: true };
    return { ok: false, status: 403, message: "This guild is private." };
  }

  app.get("/api/guilds/:id/weekly-history", requireSessionAuth, async (req, res) => {
    try {
      const gate = await assertGuildRosterVisible(req, req.params.id);
      if (!gate.ok) return res.status(gate.status).json({ message: gate.message });
      const history = await storage.getGuildWeeklyHistory(req.params.id);
      res.json({ history });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch weekly history" });
    }
  });

  // ── THORX v3 (spec E.9): Captain Portal — roster management ──────────────
  app.get("/api/guilds/:id/members", requireSessionAuth, async (req, res) => {
    try {
      const gate = await assertGuildRosterVisible(req, req.params.id);
      if (!gate.ok) return res.status(gate.status).json({ message: gate.message });
      const roster = await storage.getGuildRosterForCaptain(req.params.id);
      // Enrich roster with the members' real identity + avatar so Engine C shows
      // the actual profile picture (universal avatar id or custom upload) instead
      // of initials everywhere. The roster query returns combined `name` +
      // `profilePicture`; a light follow-up pulls firstName/identity/avatar.
      const rosterIds = roster.map((m: any) => m.userId);
      const rosterUsers = rosterIds.length
        ? await db
            .select({ id: users.id, firstName: users.firstName, identity: users.identity, avatar: users.avatar })
            .from(users)
            .where(inArray(users.id, rosterIds))
        : [];
      const rosterUserById = new Map(rosterUsers.map((u: any) => [u.id, u]));
      res.json({
        members: roster.map((m: any) => {
          const u = rosterUserById.get(m.userId) ?? {};
          return {
            ...m,
            firstName: m.firstName ?? u.firstName ?? null,
            identity: u.identity ?? null,
            avatarUrl:
              m.profilePicture ??
              (typeof u.avatar === "string" && u.avatar.startsWith("avatar-") ? `/avatars/${u.avatar}.png` : null),
          };
        }),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild members" });
    }
  });

  app.post("/api/guilds/:id/members/:userId/nudge", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      await storage.nudgeGuildMember(req.params.id, captainId, req.params.userId);
      broadcastToUser(req.params.userId, 'guild.nudge_received', { guildId: req.params.id });
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_MEMBER_NUDGED",
          targetType: "guild",
          targetId: req.params.id,
          details: { nudgedUserId: req.params.userId },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_MEMBER_NUDGED):");
      }
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to nudge member";
      res.status(400).json({ message: msg });
    }
  });

  app.post("/api/guilds/:id/members/:userId/mvp", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      const mvpBonus = await storage.setGuildMemberMvp(req.params.id, captainId, req.params.userId);
      broadcastGuildEvent(req.params.id, 'guild.mvp_selected', { userId: req.params.userId, guildId: req.params.id });
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_MVP_ASSIGNED",
          targetType: "guild",
          targetId: req.params.id,
          details: { mvpUserId: req.params.userId },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_MVP_ASSIGNED):");
      }
      res.json({ success: true, bonus: mvpBonus });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to set MVP";
      res.status(400).json({ message: msg });
    }
  });

  // ── THORX v3 (spec E.9): Captain DM ──────────────────────────────────────
  // Access control: only the guild captain OR the addressed member may read/write
  // this thread. Thread is always captain↔memberId — callers are resolved to their
  // correct role so there is no self-self thread regardless of who calls.
  app.get("/api/guilds/:id/dm/:memberId", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const guildId = req.params.id;
      const memberId = req.params.memberId;

      const guild = await storage.getGuildById(guildId);
      if (!guild) return res.status(404).json({ message: "Guild not found" });

      const captainId = guild.captainId;
      const isCaptain = captainId === userId;
      const isMember = userId === memberId;
      if (!isCaptain && !isMember) {
        return res.status(403).json({ message: "Access denied: only the guild captain or the addressed member may view this thread." });
      }

      // Thread is always (captainId ↔ memberId) regardless of who is reading.
      const messages = await storage.getCaptainMessageThread(guildId, captainId, memberId);
      res.json({ messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post("/api/guilds/:id/dm/:memberId", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const guildId = req.params.id;
      const memberId = req.params.memberId;

      const guild = await storage.getGuildById(guildId);
      if (!guild) return res.status(404).json({ message: "Guild not found" });

      const captainId = guild.captainId;
      const isCaptain = captainId === userId;
      const isMember = userId === memberId;
      if (!isCaptain && !isMember) {
        return res.status(403).json({ message: "Access denied: only the guild captain or the addressed member may send messages in this thread." });
      }

      const { message } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Message cannot be empty." });
      }
      if (message.trim().length > 1000) {
        return res.status(400).json({ message: "Message cannot exceed 1000 characters." });
      }

      // Resolve fromUserId/toUserId so the thread is always captain↔memberId.
      // A captain sends to the member; the member sends back to the captain.
      const toUserId = isCaptain ? memberId : captainId;
      const msg = await storage.sendCaptainMessage(guildId, userId, toUserId, message.trim());
      // Push DM notification to recipient so they don't need to poll (Phase 15.7)
      broadcastToUser(toUserId, 'guild.dm_received', { fromUserId: userId, guildId, messageId: msg.id });
      res.status(201).json({ message: msg });
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Failed to send message";
      res.status(400).json({ message: errMsg });
    }
  });

  // ── THORX v3 (spec E.9): Withdrawal preview & referral cash withdrawal ────
  app.get("/api/withdrawals/preview", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const points = parseInt(req.query.points as string);
      if (!Number.isFinite(points) || points <= 0) {
        return res.status(400).json({ message: "points must be a positive integer." });
      }
      const preview = await storage.previewWithdrawal(userId, points);
      res.json(preview);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to preview withdrawal";
      res.status(400).json({ message: msg });
    }
  });

  app.get("/api/user/referral-balance", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const balance = await storage.getReferralCashBalance(userId);
      res.json(balance);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch referral balance" });
    }
  });

  app.post("/api/withdrawals/referral", requireSessionAuth, withdrawalRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const referralWithdrawalSchema = z.object({
        amount:         z.number().finite().min(50, "Minimum referral cash withdrawal is Rs. 50."),
        method:         z.string().min(1).max(100),
        accountName:    z.string().min(1).max(200),
        accountNumber:  z.string().min(1).max(100),
        accountDetails: z.record(z.unknown()).optional(),
      });
      const parsed = referralWithdrawalSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const { amount, method, accountName, accountNumber, accountDetails } = parsed.data;
      const withdrawal = await storage.createReferralCashWithdrawal(
        userId, amount, method, accountName, accountNumber, accountDetails ?? {}
      );
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "WITHDRAWAL_REQUESTED",
          targetType: "user",
          targetId: userId,
          details: { amount, method, source: "referral", withdrawalId: withdrawal.id },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (WITHDRAWAL_REQUESTED referral):");
      }
      res.status(201).json({ withdrawal });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to submit referral withdrawal";
      res.status(400).json({ message: msg });
    }
  });

  // ── THORX v3 (spec E.9): Admin — Live Activity Feed ──────────────────────
  app.get("/api/admin/live-feed", requireTeamRole, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const eventType = typeof req.query.type === "string" ? req.query.type : undefined;
      const events = await storage.getActivityFeedEvents(limit, eventType);
      res.json({ events });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch activity feed" });
    }
  });

  // ── THORX v3 (spec E.9): Admin — Thorx Card simulator ────────────────────
  //
  // Audit fix (2026-07-29): `iterations` previously defaulted to 1000 when
  // omitted. The frontend's single "Draw Card" click never sent `iterations`
  // at all, so every "single" draw actually simulated and returned 1000
  // results — the client then read result[0] of the wrong dimension
  // (an entire 1000-item array, not one SimulationResult), which crashed the
  // reveal (`undefined.toLocaleString()`) and corrupted the draw-history
  // list. Default is now 1, matching what a single "Draw Card" click means.
  app.post("/api/admin/simulate/thorx-card", requireTeamRole, async (req, res) => {
    try {
      const simulateThorxCardSchema = z.object({
        iterations:    z.coerce.number().int().min(1).max(10000).default(1),
        grossPkr:      z.coerce.number().positive().max(100000).default(1.0),
        engineType:    z.enum(["A", "B", "C"]).default("A"),
        userRankTier:  z.string().default("E-Rank"),
        // Optional overrides for "what-if" testing. When omitted, the sandbox
        // resolves the SAME live System Settings values recordEarnEvent uses
        // (see storage.getThorxCardEngineConfig) — audit fix: these used to be
        // hardcoded request defaults (1000 / 0.80-1.20 / 40-60) that the
        // client never overrode, so changing System Settings had zero effect
        // on the sandbox's preview.
        conversionRate: z.coerce.number().positive().optional(),
        varianceMin:   z.coerce.number().min(0.1).max(1).optional(),
        varianceMax:   z.coerce.number().min(1).max(3).optional(),
        thorxCutPct:   z.coerce.number().min(0).max(100).optional(),
        userCutPct:    z.coerce.number().min(0).max(100).optional(),
        guildPoolPct:  z.coerce.number().min(0).max(100).optional(),
        bonusPct:      z.coerce.number().min(0).max(100).optional(),
      });
      const parsed = simulateThorxCardSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });
      const p = parsed.data;
      const live = await storage.getThorxCardEngineConfig(p.engineType);
      const conversionRate = p.conversionRate ?? live.conversionRate;
      const varianceMin = p.varianceMin ?? live.varianceMin;
      const varianceMax = Math.max(varianceMin, p.varianceMax ?? live.varianceMax);
      const thorxCutPct = p.thorxCutPct ?? live.thorxCutPct;
      const userCutPct = p.userCutPct ?? (p.engineType === "C" ? 0 : 100 - thorxCutPct);
      const guildPoolPct = p.guildPoolPct ?? live.guildPoolPct;
      const bonusPct = p.bonusPct ?? live.bonusPct;
      const result = simulateThorxCards({
        grossPkr: p.grossPkr,
        engineType: p.engineType,
        userRankTier: p.userRankTier,
        iterations: p.iterations,
        config: { conversionRate, varianceMin, varianceMax, aRankBonusPct: live.aRankBonusPct, sRankBonusPct: live.sRankBonusPct },
        engineSplits: { thorxCutPct, userCutPct, guildPoolPct, bonusPct },
      });
      // Bug found during 2026-07-15 production-readiness re-verification:
      // this used to wrap the array as { simulations, count }, but the client
      // (ThorxCardSandbox.tsx) treats the mutation response as a bare array
      // of SimulationResult (resultArray.reverse()/.length/[0], and each `r`
      // is destructured as { pointsCredited, realPkrValue, cardVariance }).
      // The wrapper object made every simulated "card" render as `undefined`,
      // throwing on `r.pointsCredited.toLocaleString()`. Spec G.9 also
      // describes the response as a flat "array of SimulationResult".
      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Simulation failed";
      res.status(400).json({ message: msg });
    }
  });

  // ── Thorx Card Sandbox — live config transparency (audit addition) ──────
  // Read-only: lets the sandbox UI display exactly which System Settings
  // values a draw will use for the selected engine, before drawing, so
  // admins can trust the simulation actually reflects production.
  app.get("/api/admin/simulate/thorx-card/live-config", requireTeamRole, async (req, res) => {
    try {
      const engineType = ["A", "B", "C"].includes(req.query.engineType as string)
        ? (req.query.engineType as "A" | "B" | "C") : "A";
      const live = await storage.getThorxCardEngineConfig(engineType);
      res.json({ engineType, ...live });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch live config" });
    }
  });

  // ── THORX v3 (spec E.9): Admin — PS / GPS manual adjustments ─────────────
  app.patch("/api/admin/users/:userId/ps", requirePermission("MANAGE_USERS"), profileRateLimiter, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const psAdjustSchema = z.object({
        delta:  z.number().finite().min(-500, "delta must be ≥ -500.").max(500, "delta must be ≤ 500."),
        reason: z.string().min(5, "reason must be at least 5 characters.").max(500),
      });
      const parsed = psAdjustSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input", errors: parsed.error.flatten() });
      const { delta, reason } = parsed.data;
      // Capture rank before the adjust so we can broadcast the right WS event type.
      const userBefore = await storage.getUserById(req.params.userId);
      const user = await storage.adminAdjustUserPS(req.params.userId, delta, String(reason).trim(), adminId);
      // Broadcast rank_updated when the rank actually changed, ps_updated otherwise.
      const eventType = user.userRankTier !== userBefore?.userRankTier ? 'rank_updated' : 'ps_updated';
      broadcastUserUpdated(req.params.userId, eventType, { delta, newPs: user.performanceScore, newRank: user.userRankTier });
      // Also fire the dedicated user.ps_updated event so the client PS notification handler triggers
      broadcastToUser(req.params.userId, 'user.ps_updated', { delta, newPs: user.performanceScore });
      res.json({ user });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to adjust PS";
      res.status(400).json({ message: msg });
    }
  });

  app.patch("/api/admin/guilds/:id/gps", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const gpsAdjustSchema = z.object({
        delta:  z.number().finite(),
        reason: z.string().min(5, "reason must be at least 5 characters.").max(500),
      });
      const parsed = gpsAdjustSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input", errors: parsed.error.flatten() });
      const { delta, reason } = parsed.data;
      const guild = await storage.adminAdjustGuildGPS(req.params.id, delta, String(reason).trim(), adminId);
      broadcastGuildEvent(req.params.id, 'guild.gps_updated', { delta, guildId: req.params.id });
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to adjust GPS";
      res.status(400).json({ message: msg });
    }
  });

  app.patch("/api/admin/guilds/:id/captain", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const captainSchema = z.object({
        newCaptainUserId: z.string().uuid("newCaptainUserId must be a valid UUID."),
      });
      const parsed = captainSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input", errors: parsed.error.flatten() });
      const { newCaptainUserId } = parsed.data;
      const guild = await storage.adminReassignCaptain(req.params.id, newCaptainUserId, adminId);
      // Notify old captain (demoted) + new captain (promoted) + all guild members (Phase 6.1)
      if (guild.captainId) {
        broadcastToUser(guild.captainId, 'guild.captain_changed', { promoted: true, guildId: req.params.id });
      }
      broadcastGuildEvent(req.params.id, 'guild.captain_changed', { newCaptainId: guild.captainId });
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to reassign captain";
      res.status(400).json({ message: msg });
    }
  });

  app.patch("/api/admin/guilds/:id/weekly-target", requireTeamRole, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const weeklyTargetSchema = z.object({
        weeklyTarget: z.number().finite().positive("weeklyTarget must be a positive number."),
      });
      const parsed = weeklyTargetSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input", errors: parsed.error.flatten() });
      const { weeklyTarget } = parsed.data;
      const guild = await storage.adminSetGuildWeeklyTarget(req.params.id, weeklyTarget, adminId);
      // 3.2 — Push the new target to all connected guild + admin sockets so
      // CaptainPortal updates without a manual refresh.
      try {
        const { broadcastGuildTargetUpdated } = await import("./realtime");
        broadcastGuildTargetUpdated(req.params.id, weeklyTarget);
      } catch { /* realtime not initialised yet — safe to skip */ }
      res.json({ guild });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to set weekly target";
      res.status(400).json({ message: msg });
    }
  });

  // ── THORX v3 (spec E.9): Admin — Referral analytics ─────────────────────
  app.get("/api/admin/referrals/stats", requireTeamRole, async (req, res) => {
    try {
      const stats = await storage.adminGetReferralStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch referral stats" });
    }
  });

  app.get("/api/admin/referrals/leaderboard", requireTeamRole, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
      const leaderboard = await storage.adminGetReferralLeaderboard(limit);
      res.json({ leaderboard });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch referral leaderboard" });
    }
  });

  // ─── Admin: Ad Router ──────────────────────────────────────────────────────
  app.get("/api/admin/ad-router/recommendation", requireTeamRole, async (req, res) => {
    try {
      const { getAdRouterRecommendation } = await import("./modules/ad-router");
      const forceRefresh = req.query.refresh === "true";
      const recommendation = await getAdRouterRecommendation(forceRefresh);
      res.json(recommendation);
    } catch (error) {
      res.status(500).json({ message: "Failed to get ad router recommendation" });
    }
  });

  app.post("/api/admin/ad-router/invalidate", requirePermission("MANAGE_SYSTEM"), async (req, res) => {
    try {
      const { invalidateRouterCache } = await import("./modules/ad-router");
      invalidateRouterCache();
      res.json({ success: true, message: "Ad router cache invalidated" });
    } catch (error) {
      res.status(500).json({ message: "Failed to invalidate cache" });
    }
  });

  // ─── Admin: Economy Engine ──────────────────────────────────────────────────
  app.get("/api/admin/economy/snapshot", requireTeamRole, async (req, res) => {
    try {
      const { getTodaySnapshot } = await import("./modules/economy-engine");
      const snapshot = await getTodaySnapshot();
      res.json(snapshot);
    } catch (error) {
      res.status(500).json({ message: "Failed to get economy snapshot" });
    }
  });

  app.post("/api/admin/economy/refresh", requirePermission("MANAGE_SYSTEM"), async (req, res) => {
    try {
      const { invalidateEconomyCache, getTodaySnapshot } = await import("./modules/economy-engine");
      invalidateEconomyCache();
      const snapshot = await getTodaySnapshot();
      res.json({ success: true, snapshot });
    } catch (error) {
      res.status(500).json({ message: "Failed to refresh economy snapshot" });
    }
  });

  // ─── Admin: Guild Wars ──────────────────────────────────────────────────────
  app.get("/api/admin/guild-wars/seasons", requireTeamRole, async (req, res) => {
    try {
      const { listSeasons, getActiveSeason } = await import("./modules/guild-wars");
      const [seasons, active] = await Promise.all([listSeasons(50), getActiveSeason()]);
      res.json({ seasons, activeSeason: active });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild war seasons" });
    }
  });

  app.post("/api/admin/guild-wars/seasons", requirePermission("MANAGE_SYSTEM"), adminActionRateLimiter, async (req, res) => {
    try {
      const parsed = z.object({
        name: z.string().min(1).max(100),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
        prizePoolPkr: z.string().regex(/^\d+(\.\d{1,4})?$/),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      const { createSeason } = await import("./modules/guild-wars");
      const season = await createSeason({
        name: parsed.data.name,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        prizePoolPkr: parsed.data.prizePoolPkr,
      });
      res.status(201).json({ season });
    } catch (error) {
      res.status(500).json({ message: "Failed to create guild war season" });
    }
  });

  app.patch("/api/admin/guild-wars/seasons/:id/activate", requirePermission("MANAGE_SYSTEM"), adminActionRateLimiter, async (req, res) => {
    try {
      const { activateSeason } = await import("./modules/guild-wars");
      const season = await activateSeason(req.params.id);
      if (!season) return res.status(404).json({ message: "Season not found" });
      res.json({ season });
    } catch (error) {
      res.status(500).json({ message: "Failed to activate season" });
    }
  });

  app.get("/api/admin/guild-wars/wars", requireTeamRole, async (req, res) => {
    try {
      const { db } = await import("./db");
      const { guildWars, guilds } = await import("@shared/schema");
      const { desc, eq, inArray } = await import("drizzle-orm");
      const wars = await db.select().from(guildWars).orderBy(desc(guildWars.createdAt)).limit(50);
      const guildIds = Array.from(new Set(wars.flatMap(w => [w.challengerGuildId, w.challengedGuildId])));
      const guildRows = guildIds.length
        ? await db.select({ id: guilds.id, name: guilds.name }).from(guilds).where(inArray(guilds.id, guildIds))
        : [];
      const guildNames = new Map(guildRows.map(g => [g.id, g.name]));
      res.json({
        wars: wars.map(w => ({
          ...w,
          challengerGuildName: guildNames.get(w.challengerGuildId) ?? null,
          challengedGuildName: guildNames.get(w.challengedGuildId) ?? null,
          winnerGuildName: w.winnerId ? guildNames.get(w.winnerId) ?? null : null,
        })),
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild wars" });
    }
  });

  app.post("/api/admin/guild-wars/wars", requirePermission("MANAGE_SYSTEM"), adminActionRateLimiter, async (req, res) => {
    try {
      // startDate/endDate/prizePoolPkr removed: guild_wars has no columns for
      // them (dates are derived from startedAt/completedAt; prize comes from
      // the live pool-capture mechanic, not a fixed value), and createWar()
      // never accepted them — the API was silently discarding whatever the
      // caller sent for these fields.
      const parsed = z.object({
        seasonId: z.string().min(1),
        guild1Id: z.string().min(1),
        guild2Id: z.string().min(1),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten() });
      const { createWar } = await import("./modules/guild-wars");
      const war = await createWar({
        seasonId: parsed.data.seasonId,
        challengerGuildId: parsed.data.guild1Id,
        challengedGuildId: parsed.data.guild2Id,
      });
      res.status(201).json({ war });
    } catch (error: any) {
      const msg = error?.message?.includes("itself") ? error.message : "Failed to create war";
      res.status(error?.message?.includes("itself") ? 400 : 500).json({ message: msg });
    }
  });

  app.patch("/api/admin/guild-wars/wars/:id/resolve", requirePermission("MANAGE_SYSTEM"), adminActionRateLimiter, async (req, res) => {
    try {
      const { resolveWar } = await import("./modules/guild-wars");
      const result = await resolveWar(req.params.id);
      // Enrich with the winner's guild name — the frontend displays it in the
      // resolve toast, but resolveWar() only returns raw IDs.
      const winnerGuild = result.winnerId ? await storage.getGuildById(result.winnerId) : null;
      res.json({ ...result, winnerGuildName: winnerGuild?.name ?? null });
    } catch (error: any) {
      const status = error?.message === "War not found" ? 404 : 500;
      res.status(status).json({ message: error?.message || "Failed to resolve war" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GUILD CREATION REQUESTS — Admin Approval Flow (Phase 4.2)
  // B-Rank+ users submit requests; admin approves/rejects.
  // ═══════════════════════════════════════════════════════════════════════════

  // User submits a guild creation request (replaces direct creation)
  app.post("/api/guilds/creation-request", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const schema = z.object({
        guildName: z.string().trim().min(3, "Guild name must be at least 3 characters.").max(60),
        description: z.string().trim().max(500).optional(),
        reason: z.string().trim().min(50, "Reason must be at least 50 characters.").max(1000),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });

      // Beta policy: B-Rank minimum to request guild creation (engines themselves
      // stay open to every rank; only CREATION is gated). Admin approval remains
      // the second gate.
      if (!(await meetsGuildCreationRank(userId))) {
        return res.status(403).json({ error: "RANK_GATE", requiredRank: GUILD_CREATION_MIN_RANK, message: `Requesting guild creation requires ${GUILD_CREATION_MIN_RANK} or higher.` });
      }
      const user = await storage.getUserById(userId);

      // Check if user already has a pending request
      const existing = await db.select().from(guildCreationRequests)
        .where(and(eq(guildCreationRequests.userId, userId), eq(guildCreationRequests.status, "pending")))
        .limit(1);
      if (existing[0]) return res.status(409).json({ message: "You already have a pending guild creation request." });

      // Check if user is already in a guild
      const membership = await storage.getUserGuildMembership(userId);
      if (membership?.status === "active") return res.status(409).json({ message: "You are already a guild member." });

      const [request] = await db.insert(guildCreationRequests)
        .values({ userId, guildName: parsed.data.guildName, description: parsed.data.description, reason: parsed.data.reason })
        .returning();
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_CREATION_REQUESTED",
          targetType: "guild_creation_request",
          targetId: request.id,
          details: { name: parsed.data.guildName },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_CREATION_REQUESTED):");
      }
      res.status(201).json({ request });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to submit guild creation request";
      res.status(400).json({ message: msg });
    }
  });

  // User gets their own guild creation request status
  app.get("/api/guilds/my-creation-request", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const [request] = await db.select().from(guildCreationRequests)
        .where(eq(guildCreationRequests.userId, userId))
        .orderBy(desc(guildCreationRequests.createdAt))
        .limit(1);
      res.json({ request: request ?? null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch request" });
    }
  });

  // Admin: list all guild creation requests
  app.get("/api/admin/guild-creation-requests", requirePermission("MANAGE_SYSTEM"), async (req, res) => {
    try {
      const status = (req.query.status as string) || "pending";
      const requests = await db.select({
        id: guildCreationRequests.id,
        userId: guildCreationRequests.userId,
        guildName: guildCreationRequests.guildName,
        description: guildCreationRequests.description,
        reason: guildCreationRequests.reason,
        status: guildCreationRequests.status,
        adminNote: guildCreationRequests.adminNote,
        reviewedAt: guildCreationRequests.reviewedAt,
        createdAt: guildCreationRequests.createdAt,
        createdGuildId: guildCreationRequests.createdGuildId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        userRankTier: users.userRankTier,
      })
        .from(guildCreationRequests)
        .leftJoin(users, eq(guildCreationRequests.userId, users.id))
        .where(status === "all" ? sql`1=1` : eq(guildCreationRequests.status, status))
        .orderBy(desc(guildCreationRequests.createdAt))
        .limit(100);
      res.json({ requests });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild creation requests" });
    }
  });

  // Admin: approve or reject a guild creation request
  app.post("/api/admin/guild-creation-requests/:id/decide", requirePermission("MANAGE_SYSTEM"), adminActionRateLimiter, async (req, res) => {
    try {
      const adminId = getThorxPrincipalId(req) as string;
      const schema = z.object({
        action: z.enum(["approve", "reject"]),
        adminNote: z.string().max(500).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });

      const [request] = await db.select().from(guildCreationRequests)
        .where(and(eq(guildCreationRequests.id, req.params.id), eq(guildCreationRequests.status, "pending")))
        .limit(1);
      if (!request) return res.status(404).json({ message: "Request not found or already decided" });

      if (parsed.data.action === "approve") {
        // Create the guild and make the user captain
        const guild = await storage.createGuild({
          name: request.guildName,
          description: request.description ?? undefined,
          captainId: request.userId,
        });
        await db.update(guildCreationRequests)
          .set({ status: "approved", adminNote: parsed.data.adminNote, reviewedBy: adminId, reviewedAt: new Date(), createdGuildId: guild.id, updatedAt: new Date() })
          .where(eq(guildCreationRequests.id, req.params.id));
        // Notify the user
        await storage.createNotification({
          userId: request.userId,
          title: "Guild Creation Approved! 🎉",
          message: `Your guild "${request.guildName}" has been approved. You are now its Captain!`,
          type: "info",
        });
        broadcastToUser(request.userId, 'guild.creation_approved', { guildId: guild.id, guildName: guild.name });
        // Every other admin action against a guild writes an audit_logs row keyed
        // to that guild — this was the one exception (a guild being CREATED via
        // this path had no record at all), which also meant it never showed up
        // in that guild's own activity log below.
        await storage.createAuditLog({
          adminId,
          actorRole: req.userProfile?.role,
          action: "GUILD_CREATION_REQUEST_APPROVED",
          targetType: "guild",
          targetId: guild.id,
          details: { requestId: request.id, guildName: guild.name, captainId: request.userId, adminNote: parsed.data.adminNote ?? null },
        }, getRequestContext(req));
        res.json({ success: true, guild });
      } else {
        await db.update(guildCreationRequests)
          .set({ status: "rejected", adminNote: parsed.data.adminNote, reviewedBy: adminId, reviewedAt: new Date(), updatedAt: new Date() })
          .where(eq(guildCreationRequests.id, req.params.id));
        await storage.createNotification({
          userId: request.userId,
          title: "Guild Creation Request Rejected",
          message: parsed.data.adminNote ? `Your guild creation request was rejected. Reason: ${parsed.data.adminNote}` : "Your guild creation request was not approved at this time.",
          type: "info",
        });
        broadcastToUser(request.userId, 'guild.creation_rejected', { reason: parsed.data.adminNote });
        await storage.createAuditLog({
          adminId,
          actorRole: req.userProfile?.role,
          action: "GUILD_CREATION_REQUEST_REJECTED",
          targetType: "guild_creation_request",
          targetId: request.id,
          details: { guildName: request.guildName, requestedBy: request.userId, adminNote: parsed.data.adminNote ?? null },
        }, getRequestContext(req));
        res.json({ success: true });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to decide request";
      res.status(400).json({ message: msg });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GUILD WARS — User-Facing Routes (Phase 6)
  // ═══════════════════════════════════════════════════════════════════════════

  // Get current war status for a guild
  app.get("/api/guilds/:id/war", requireSessionAuth, async (req, res) => {
    try {
      const { getGuildCurrentWar, getWarWithApprovals, getGuildBadges } = await import("./modules/guild-wars");
      const guildId = req.params.id;
      // Authorization fix: previously any authenticated user could view any
      // guild's war status/approvals by guessing an ID — info leak. Restrict
      // to members (pending or active) of the requested guild.
      const requesterId = getThorxPrincipalId(req) as string;
      const membership = await storage.getUserGuildMembership(requesterId);
      if (!membership || membership.guildId !== guildId) {
        return res.status(403).json({ message: "You are not a member of this guild" });
      }
      const [currentWar, badges] = await Promise.all([
        getGuildCurrentWar(guildId),
        getGuildBadges(guildId),
      ]);
      if (!currentWar) return res.json({ war: null, badges });

      const approvals = await getWarWithApprovals(currentWar.id, guildId);

      // Enrich with guild names + live war chest balances (halal prize model)
      const [challengerGuild, challengedGuild, myGuild] = await Promise.all([
        storage.getGuildById(currentWar.challengerGuildId),
        storage.getGuildById(currentWar.challengedGuildId),
        storage.getGuildById(guildId),
      ]);

      // War chest funding config — per-engine % of gross routed from THORX's
      // revenue cut into each guild's chest while the war is active.
      const [warLevyEngineA, warLevyEngineB, warLevyEngineC] = await Promise.all([
        storage.getSystemConfigValue<number>("WAR_LEVY_ENGINE_A_PCT", 2),
        storage.getSystemConfigValue<number>("WAR_LEVY_ENGINE_B_PCT", 2),
        storage.getSystemConfigValue<number>("WAR_LEVY_ENGINE_C_PCT", 2),
      ]);

      res.json({
        war: currentWar,
        challengerGuild: challengerGuild ? { id: challengerGuild.id, name: challengerGuild.name, guildPerformanceScore: challengerGuild.guildPerformanceScore, avatarUrl: challengerGuild.avatarUrl ?? null, warChestPkr: challengerGuild.warChestPkr ?? "0.0000" } : null,
        challengedGuild: challengedGuild ? { id: challengedGuild.id, name: challengedGuild.name, guildPerformanceScore: challengedGuild.guildPerformanceScore, avatarUrl: challengedGuild.avatarUrl ?? null, warChestPkr: challengedGuild.warChestPkr ?? "0.0000" } : null,
        warChest: { myGuildChestPkr: myGuild?.warChestPkr ?? "0.0000" },
        warLevyPcts: { engineA: warLevyEngineA, engineB: warLevyEngineB, engineC: warLevyEngineC },
        approvals: approvals.approvals,
        totalActiveMembers: approvals.totalActiveMembers,
        approvedCount: approvals.approvedCount,
        badges,
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch war status" });
    }
  });

  // Battle history for the Discovery guild detail modal — readable for any
  // public guild (and members of private guilds); completed wars only.
  app.get("/api/guilds/:id/war/history", requireSessionAuth, async (req, res) => {
    try {
      const gate = await assertGuildRosterVisible(req, req.params.id);
      if (!gate.ok) return res.status(gate.status).json({ message: gate.message });
      const [asChallenger, asChallenged] = await Promise.all([
        db.select().from(guildWars).where(eq(guildWars.challengerGuildId, req.params.id)).orderBy(desc(guildWars.completedAt)).limit(5),
        db.select().from(guildWars).where(eq(guildWars.challengedGuildId, req.params.id)).orderBy(desc(guildWars.completedAt)).limit(5),
      ]);
      const byId = new Map<string, any>();
      [...asChallenger, ...asChallenged].forEach(w => { if (w.completedAt) byId.set(w.id, w); });
      const wars = [...byId.values()]
        .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
        .slice(0, 5);
      res.json({ wars });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch war history" });
    }
  });

  // Captain initiates a challenge against another guild
  app.post("/api/guilds/:id/war/challenge", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      const schema = z.object({ challengedGuildId: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "challengedGuildId is required" });

      const { initiateChallenge } = await import("./modules/guild-wars");
      const war = await initiateChallenge({
        challengerGuildId: req.params.id,
        challengedGuildId: parsed.data.challengedGuildId,
        captainId,
      });

      // Notify all challenger guild members to vote
      broadcastGuildEvent(req.params.id, 'guild.war_challenge_initiated', { warId: war.id, challengedGuildId: parsed.data.challengedGuildId });
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_WAR_CHALLENGED",
          targetType: "guild_war",
          targetId: war.id,
          details: { challengerGuildId: req.params.id, challengedGuildId: parsed.data.challengedGuildId },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_WAR_CHALLENGED):");
      }
      res.status(201).json({ war });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to initiate challenge";
      res.status(400).json({ message: msg });
    }
  });

  // Member votes to approve or reject war participation
  app.post("/api/guilds/:id/war/:warId/vote", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const schema = z.object({ approved: z.boolean() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "approved (boolean) is required" });

      const { voteOnWar } = await import("./modules/guild-wars");
      const result = await voteOnWar({ warId: req.params.warId, userId, approved: parsed.data.approved });

      if (result.cancelled) {
        broadcastGuildEvent(req.params.id, 'guild.war_cancelled', { warId: req.params.warId });
      } else if (result.allApproved) {
        if (result.war.status === "active") {
          // War is now active — notify both guilds
          broadcastGuildEvent(result.war.challengerGuildId, 'guild.war_started', { warId: req.params.warId });
          broadcastGuildEvent(result.war.challengedGuildId, 'guild.war_started', { warId: req.params.warId });
        } else {
          // Moved to pending_challenged_approval — notify challenged guild
          broadcastGuildEvent(result.war.challengedGuildId, 'guild.war_challenge_received', { warId: req.params.warId, challengerGuildId: result.war.challengerGuildId });
        }
      }

      res.json(result);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to vote on war";
      res.status(400).json({ message: msg });
    }
  });

  // Captain cancels a pending war challenge
  app.post("/api/guilds/:id/war/:warId/cancel", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      const { cancelWar } = await import("./modules/guild-wars");
      const war = await cancelWar(req.params.warId, captainId);
      broadcastGuildEvent(req.params.id, 'guild.war_cancelled', { warId: req.params.warId });
      broadcastGuildEvent(war.challengedGuildId, 'guild.war_cancelled', { warId: req.params.warId });
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_WAR_CANCELLED",
          targetType: "guild_war",
          targetId: req.params.warId,
          details: { guildId: req.params.id },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_WAR_CANCELLED):");
      }
      res.json({ war });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to cancel war";
      res.status(400).json({ message: msg });
    }
  });

  // Get guilds available for challenge (same difficulty, no active war, not own guild)
  app.get("/api/guilds/:id/war/eligible-opponents", requireSessionAuth, async (req, res) => {
    try {
      const guildId = req.params.id;
      const myGuild = await storage.getGuildById(guildId);
      if (!myGuild) return res.status(404).json({ message: "Guild not found" });

      // Get active/pending war guild IDs to exclude
      const activeWars = await db.select({
        cId: guildWars.challengerGuildId,
        dId: guildWars.challengedGuildId,
      }).from(guildWars).where(
        or(eq(guildWars.status, "active"), eq(guildWars.status, "pending_challenger_approval"), eq(guildWars.status, "pending_challenged_approval"))
      );
      const busyGuildIds = new Set(activeWars.flatMap(w => [w.cId, w.dId]));

      const allGuilds = await storage.getGuildDiscoveryList();
      const opponents = allGuilds.filter(g =>
        g.id !== guildId &&
        g.status === "active" &&
        g.targetDifficulty === myGuild.targetDifficulty &&
        !busyGuildIds.has(g.id)
      );
      res.json({ opponents });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch eligible opponents" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ASSISTANT CAPTAIN — Management Routes (Phase 4.8)
  // ═══════════════════════════════════════════════════════════════════════════

  // Set assistant captain
  app.post("/api/guilds/:id/assistant-captain", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      const schema = z.object({ memberId: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "memberId is required" });

      const guild = await storage.getGuildById(req.params.id);
      if (!guild) return res.status(404).json({ message: "Guild not found" });
      if (guild.captainId !== captainId) return res.status(403).json({ message: "Only captain can set assistant captain" });

      // Verify the member is an active member of this guild
      const [membership] = await db.select().from(guildMembers)
        .where(and(eq(guildMembers.guildId, req.params.id), eq(guildMembers.userId, parsed.data.memberId), eq(guildMembers.status, "active")))
        .limit(1);
      if (!membership) return res.status(404).json({ message: "Member not found in guild" });
      if (parsed.data.memberId === captainId) return res.status(400).json({ message: "Captain cannot set themselves as assistant" });

      await db.update(guilds)
        .set({ assistantCaptainId: parsed.data.memberId, updatedAt: new Date() })
        .where(eq(guilds.id, req.params.id));

      await storage.createNotification({
        userId: parsed.data.memberId,
        title: "⚔️ You are now Assistant Captain!",
        message: `You have been appointed as Assistant Captain of ${guild.name}.`,
        type: "info",
      });
      broadcastToUser(parsed.data.memberId, 'guild.assistant_captain_appointed', { guildId: req.params.id });
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_ASSISTANT_CAPTAIN_ASSIGNED",
          targetType: "guild",
          targetId: req.params.id,
          details: { assistantUserId: parsed.data.memberId },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_ASSISTANT_CAPTAIN_ASSIGNED):");
      }
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to set assistant captain";
      res.status(400).json({ message: msg });
    }
  });

  // Remove assistant captain
  app.delete("/api/guilds/:id/assistant-captain", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      const guild = await storage.getGuildById(req.params.id);
      if (!guild) return res.status(404).json({ message: "Guild not found" });
      if (guild.captainId !== captainId) return res.status(403).json({ message: "Only captain can remove assistant captain" });

      await db.update(guilds)
        .set({ assistantCaptainId: null, assistantPermissions: [], updatedAt: new Date() })
        .where(eq(guilds.id, req.params.id));
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_ASSISTANT_CAPTAIN_REMOVED",
          targetType: "guild",
          targetId: req.params.id,
          details: { removedAssistantUserId: guild.assistantCaptainId },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_ASSISTANT_CAPTAIN_REMOVED):");
      }
      res.json({ success: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to remove assistant captain";
      res.status(400).json({ message: msg });
    }
  });

  // Update assistant captain permissions
  app.patch("/api/guilds/:id/assistant-captain/permissions", requireSessionAuth, async (req, res) => {
    try {
      const captainId = getThorxPrincipalId(req) as string;
      const schema = z.object({
        permissions: z.array(z.string()).max(20),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "permissions must be an array of strings" });

      const guild = await storage.getGuildById(req.params.id);
      if (!guild) return res.status(404).json({ message: "Guild not found" });
      const isTeamRole = ["team", "admin", "founder"].includes(req.userProfile?.role || "");
      if (guild.captainId !== captainId && !isTeamRole) return res.status(403).json({ message: "Only the captain or team admins can update assistant permissions" });

      await db.update(guilds)
        .set({ assistantPermissions: parsed.data.permissions, updatedAt: new Date() })
        .where(eq(guilds.id, req.params.id));
      try {
        await storage.createAuditLog({
          adminId: captainId,
          actorRole: req.userProfile?.role,
          action: "GUILD_ASSISTANT_CAPTAIN_PERMISSIONS_UPDATED",
          targetType: "guild",
          targetId: req.params.id,
          details: { assistantUserId: guild.assistantCaptainId, permissions: parsed.data.permissions },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_ASSISTANT_CAPTAIN_PERMISSIONS_UPDATED):");
      }
      res.json({ success: true, permissions: parsed.data.permissions });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to update permissions";
      res.status(400).json({ message: msg });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // GUILD PROFILES — Per-member identity inside a guild (Phase 5)
  // ═══════════════════════════════════════════════════════════════════════════

  // Get my guild profile
  app.get("/api/guilds/:id/profile/me", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const [profile] = await db.select().from(guildProfiles)
        .where(and(eq(guildProfiles.guildId, req.params.id), eq(guildProfiles.userId, userId)))
        .limit(1);
      res.json({ profile: profile ?? null });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild profile" });
    }
  });

  // Create or update my guild profile
  app.post("/api/guilds/:id/profile", requireSessionAuth, profileRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const schema = z.object({
        username: z.string().trim().min(2).max(50).optional(),
        description: z.string().trim().max(500).optional(),
        links: z.array(z.object({ label: z.string().max(50), url: z.string().url() })).max(5).optional(),
        favoriteMemberId: z.string().nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Invalid input" });

      // Verify user is active member
      const [membership] = await db.select().from(guildMembers)
        .where(and(eq(guildMembers.guildId, req.params.id), eq(guildMembers.userId, userId), eq(guildMembers.status, "active")))
        .limit(1);
      if (!membership) return res.status(403).json({ message: "You must be an active guild member to have a guild profile" });

      const [existing] = await db.select().from(guildProfiles)
        .where(and(eq(guildProfiles.guildId, req.params.id), eq(guildProfiles.userId, userId)))
        .limit(1);

      let profile;
      if (existing) {
        [profile] = await db.update(guildProfiles)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(and(eq(guildProfiles.guildId, req.params.id), eq(guildProfiles.userId, userId)))
          .returning();
      } else {
        // Pre-fill from user profile
        const user = await storage.getUserById(userId);
        [profile] = await db.insert(guildProfiles)
          .values({
            userId,
            guildId: req.params.id,
            username: parsed.data.username || `${user?.firstName || ""} ${user?.lastName || ""}`.trim() || user?.identity || "Member",
            description: parsed.data.description,
            links: parsed.data.links || [],
            favoriteMemberId: parsed.data.favoriteMemberId,
          })
          .returning();
      }
      try {
        await storage.createAuditLog({
          adminId: userId,
          actorRole: req.userProfile?.role,
          action: "GUILD_PROFILE_UPDATED",
          targetType: "guild",
          targetId: req.params.id,
          details: { updatedFields: Object.keys(parsed.data), created: !existing },
        }, getRequestContext(req));
      } catch (auditErr) {
        logger.error({ err: auditErr }, "Audit log error (GUILD_PROFILE_UPDATED):");
      }
      res.json({ profile });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to save guild profile";
      res.status(400).json({ message: msg });
    }
  });

  // Get all profiles in a guild (visible to members)
  app.get("/api/guilds/:id/profiles", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      // Must be a member to see profiles
      const [membership] = await db.select().from(guildMembers)
        .where(and(eq(guildMembers.guildId, req.params.id), eq(guildMembers.userId, userId), eq(guildMembers.status, "active")))
        .limit(1);
      if (!membership) return res.status(403).json({ message: "Must be an active guild member" });

      const profiles = await db.select().from(guildProfiles)
        .where(eq(guildProfiles.guildId, req.params.id));
      res.json({ profiles });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch guild profiles" });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE CHAT — Upgraded from Captain-Only DM to Member-to-Member (Phase 4.4)
  // Any active guild member can message any other active member in the same guild.
  // ═══════════════════════════════════════════════════════════════════════════

  // Get private chat thread between two guild members (replaces old captain-only DM)
  app.get("/api/guilds/:id/private-chat/:memberId", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const guildId = req.params.id;
      const otherId = req.params.memberId;

      if (userId === otherId) return res.status(400).json({ message: "Cannot chat with yourself" });

      // Both must be active members
      const [myMembership, theirMembership] = await Promise.all([
        db.select().from(guildMembers).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId), eq(guildMembers.status, "active"))).limit(1),
        db.select().from(guildMembers).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, otherId), eq(guildMembers.status, "active"))).limit(1),
      ]);
      if (!myMembership[0] || !theirMembership[0]) return res.status(403).json({ message: "Both users must be active members of this guild" });

      // Thread uses consistent ordering: lower id first
      const [fromId, toId] = userId < otherId ? [userId, otherId] : [otherId, userId];
      const messages = await storage.getCaptainMessageThread(guildId, fromId, toId);
      res.json({ messages });
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch private chat" });
    }
  });

  // Send private message to any guild member
  app.post("/api/guilds/:id/private-chat/:memberId", requireSessionAuth, guildInteractionRateLimiter, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const guildId = req.params.id;
      const otherId = req.params.memberId;

      if (userId === otherId) return res.status(400).json({ message: "Cannot message yourself" });

      const [myMembership, theirMembership] = await Promise.all([
        db.select().from(guildMembers).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, userId), eq(guildMembers.status, "active"))).limit(1),
        db.select().from(guildMembers).where(and(eq(guildMembers.guildId, guildId), eq(guildMembers.userId, otherId), eq(guildMembers.status, "active"))).limit(1),
      ]);
      if (!myMembership[0] || !theirMembership[0]) return res.status(403).json({ message: "Both users must be active members of this guild" });

      const { message } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Message cannot be empty." });
      }
      if (message.trim().length > 1000) return res.status(400).json({ message: "Message too long (max 1000 chars)." });

      // Use consistent thread key (lower id = fromId in storage)
      const [fromId, toId] = userId < otherId ? [userId, otherId] : [otherId, userId];
      const msg = await storage.sendCaptainMessage(guildId, userId, otherId, message.trim());
      broadcastToUser(otherId, 'guild.dm_received', { fromUserId: userId, guildId, messageId: msg.id });
      res.status(201).json({ message: msg });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to send message";
      res.status(400).json({ message: msg });
    }
  });

  const httpServer = existingServer ?? createServer(app);
  initRealtime(httpServer, session(sessionConfig));
  return httpServer;
}