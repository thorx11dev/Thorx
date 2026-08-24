import type { Express, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "@shared/schema";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { requireSessionAuth } from "../routes";
import { publicApiRateLimiter } from "../middleware/auth-rate-limit";
import { encryptCredential, decryptCredential } from "../utils/credential-crypto";
import { buildOtpauthUri, generateTotpSecret, verifyTotp } from "../lib/totp";

/**
 * Account-level TOTP 2FA management.
 * Enrollment is two-step: setup() provisions a PENDING secret, enable()
 * promotes it only after one live authenticator code verifies — a typo during
 * setup can never lock an account. Disable re-verifies a live code too.
 */
export function registerSecurityRoutes(app: Express): void {
  const getAuthenticatedUser = async (req: Request) => {
    const userId = (req as any).session?.userId as string | undefined;
    if (!userId) return null;
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return user ?? null;
  };

  // ── Status ──────────────────────────────────────────────────────────────
  app.get("/api/security/2fa/status", requireSessionAuth, async (req: Request, res: Response) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ error: "NO_SESSION" });
      res.json({ enabled: Boolean(user.totpEnabled) });
    } catch (error) {
      logger.error({ err: error }, "[2FA] status failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  // ── Step 1: provision pending secret ────────────────────────────────────
  app.post("/api/security/2fa/setup", requireSessionAuth, publicApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ error: "NO_SESSION" });
      if (user.totpEnabled) {
        return res.status(409).json({ error: "ALREADY_ENABLED", message: "2FA is already active on this account." });
      }

      const secret = generateTotpSecret();
      await db
        .update(users)
        .set({ totpPendingSecret: encryptCredential(secret), updatedAt: new Date() })
        .where(eq(users.id, user.id));

      const otpauthUri = buildOtpauthUri(secret, user.email || user.identity || user.id);
      logger.info({ userId: user.id }, "[2FA] setup secret provisioned (pending confirmation)");
      res.json({ secret, otpauthUri });
    } catch (error) {
      logger.error({ err: error }, "[2FA] setup failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  // ── Step 2: confirm with a live code ────────────────────────────────────
  app.post("/api/security/2fa/enable", requireSessionAuth, publicApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ error: "NO_SESSION" });
      if (user.totpEnabled) {
        return res.status(409).json({ error: "ALREADY_ENABLED", message: "2FA is already active." });
      }
      if (!user.totpPendingSecret) {
        return res.status(400).json({ error: "NO_PENDING_SETUP", message: "Start the setup flow first." });
      }

      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      const pendingSecret = decryptCredential(user.totpPendingSecret);
      if (!verifyTotp(pendingSecret, code)) {
        logger.warn({ userId: user.id }, "[2FA] enable rejected — invalid code");
        return res.status(401).json({ error: "INVALID_CODE", message: "That code is not valid. Check your authenticator clock and try the next code." });
      }

      await db
        .update(users)
        .set({
          totpSecret: user.totpPendingSecret,
          totpPendingSecret: null,
          totpEnabled: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      logger.info({ userId: user.id }, "[2FA] enabled");
      res.json({ enabled: true });
    } catch (error) {
      logger.error({ err: error }, "[2FA] enable failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });

  // ── Disable (live code required) ─────────────────────────────────────────
  app.post("/api/security/2fa/disable", requireSessionAuth, publicApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const user = await getAuthenticatedUser(req);
      if (!user) return res.status(401).json({ error: "NO_SESSION" });
      if (!user.totpEnabled || !user.totpSecret) {
        return res.status(400).json({ error: "NOT_ENABLED", message: "2FA is not active." });
      }

      const code = typeof req.body?.code === "string" ? req.body.code.trim() : "";
      const secret = decryptCredential(user.totpSecret);
      if (!verifyTotp(secret, code)) {
        logger.warn({ userId: user.id }, "[2FA] disable rejected — invalid code");
        return res.status(401).json({ error: "INVALID_CODE", message: "That code is not valid." });
      }

      await db
        .update(users)
        .set({ totpSecret: null, totpPendingSecret: null, totpEnabled: false, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      logger.info({ userId: user.id }, "[2FA] disabled");
      res.json({ enabled: false });
    } catch (error) {
      logger.error({ err: error }, "[2FA] disable failed");
      res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  });
}
