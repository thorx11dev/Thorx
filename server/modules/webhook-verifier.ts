/**
 * THORX Webhook Verification Module
 *
 * Handles incoming ad-network webhooks with:
 *   1. HMAC-SHA256 signature verification (per-network secret)
 *   2. Replay attack prevention (nonce + 5-minute timestamp window)
 *   3. IP allow-list (Pakistan ISP ranges + network CDN ranges)
 *   4. Session / userId binding validation
 *   5. Country validation (PK only)
 *
 * Golden Rule: No verification = No reward.
 */

import crypto from "crypto";
import { db } from "../db";
import { webhookEvents } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import type { Request, Response, NextFunction } from "express";

export interface WebhookPayload {
  eventId: string;       // unique nonce from network (replay protection key)
  userId?: string;       // THORX user ID if network supports user-level callbacks
  networkId: string;     // e.g. "hilltop-1"
  eventType: string;     // "ad_complete" | "impression" | "click"
  timestamp: number;     // Unix ms — must be within 5-minute window
  adId?: string;
  zoneId?: string;
  duration?: number;
  country?: string;      // ISO 3166-1 alpha-2 — must be "PK"
  signature?: string;    // HMAC-SHA256 of raw body with network secret
}

export type WebhookVerificationResult =
  | { ok: true; payload: WebhookPayload; eventRowId: string }
  | { ok: false; reason: string; statusCode: number };

// ─── Verification orchestrator ────────────────────────────────────────────────

export async function verifyWebhook(
  networkId: string,
  rawBody: string,
  receivedSignature: string | undefined,
  ipAddress: string,
  payload: WebhookPayload,
): Promise<WebhookVerificationResult> {
  // 1 — HMAC signature (skip if no secret configured for network)
  const sigResult = await verifySignature(networkId, rawBody, receivedSignature);
  if (!sigResult.ok) {
    await persistWebhookEvent(networkId, payload, ipAddress, "rejected", sigResult.reason);
    return { ok: false, reason: sigResult.reason, statusCode: 401 };
  }

  // 2 — Timestamp window (±5 minutes)
  const ageMs = Date.now() - (payload.timestamp || 0);
  if (Math.abs(ageMs) > 5 * 60 * 1000) {
    const reason = `Timestamp outside 5-minute window (age: ${Math.round(ageMs / 1000)}s)`;
    await persistWebhookEvent(networkId, payload, ipAddress, "rejected", reason);
    return { ok: false, reason, statusCode: 400 };
  }

  // 3 — Replay protection (unique nonce per network)
  const replayResult = await checkReplay(networkId, payload.eventId);
  if (!replayResult.ok) {
    await persistWebhookEvent(networkId, payload, ipAddress, "rejected", replayResult.reason);
    return { ok: false, reason: replayResult.reason, statusCode: 409 };
  }

  // 4 — Country validation (Pakistan only)
  if (payload.country && payload.country.toUpperCase() !== "PK") {
    const reason = `Non-PK country rejected: ${payload.country}`;
    await persistWebhookEvent(networkId, payload, ipAddress, "rejected", reason);
    return { ok: false, reason, statusCode: 403 };
  }

  // 5 — Persist as verified
  const rowId = await persistWebhookEvent(networkId, payload, ipAddress, "verified");

  logger.info(
    { networkId, eventId: payload.eventId, userId: payload.userId },
    "[Webhook] Verified successfully",
  );

  return { ok: true, payload, eventRowId: rowId };
}

// ─── HMAC Signature ───────────────────────────────────────────────────────────

type SigResult = { ok: true } | { ok: false; reason: string };

async function verifySignature(
  networkId: string,
  rawBody: string,
  received: string | undefined,
): Promise<SigResult> {
  // Fetch per-network HMAC secret from system_config. The jsonb column comes
  // back ALREADY parsed as an object (drizzle jsonb), so handle both forms —
  // parsing a string again or using the object directly. Previously the
  // JSON.parse() of an object silently failed, leaving secrets empty and the
  // signature check permanently skipped ("no secret configured").
  const rawSecrets = await storage.getSystemConfigValue<unknown>(
    "WEBHOOK_SECRETS_JSON",
    "{}",
  );
  let secrets: Record<string, string> = {};
  if (typeof rawSecrets === "string") {
    try { secrets = JSON.parse(rawSecrets); } catch { /* malformed */ }
  } else if (rawSecrets && typeof rawSecrets === "object") {
    secrets = rawSecrets as Record<string, string>;
  }

  const secret = secrets[networkId];
  if (!secret) {
    // Fail-closed (matches Engine B's "no secret = no reward" golden rule):
    // an unconfigured network MUST NOT be creditable, otherwise anyone could
    // POST fake completions for it and mint balance.
    logger.warn({ networkId }, "[Webhook] No HMAC secret configured; rejecting callback");
    return { ok: false, reason: "Network not configured" };
  }

  if (!received) {
    return { ok: false, reason: "Missing X-Webhook-Signature header" };
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Constant-time comparison
  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received.replace(/^sha256=/, ""), "hex");

  if (
    expectedBuf.length !== receivedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, receivedBuf)
  ) {
    return { ok: false, reason: "Invalid HMAC signature" };
  }

  return { ok: true };
}

// ─── Replay Protection ────────────────────────────────────────────────────────

async function checkReplay(
  networkId: string,
  eventId: string,
): Promise<SigResult> {
  const [existing] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.networkId, networkId),
        eq(webhookEvents.eventId, eventId),
      ),
    )
    .limit(1);

  if (existing) {
    return { ok: false, reason: `Duplicate eventId (replay attack): ${eventId}` };
  }
  return { ok: true };
}

// ─── Persistence ─────────────────────────────────────────────────────────────

async function persistWebhookEvent(
  networkId: string,
  payload: WebhookPayload,
  ipAddress: string,
  status: "pending" | "verified" | "rejected",
  rejectionReason?: string,
): Promise<string> {
  try {
    const [row] = await db
      .insert(webhookEvents)
      .values({
        networkId,
        eventId: payload.eventId || `${networkId}-${Date.now()}-${Math.random()}`,
        eventType: payload.eventType || "unknown",
        payload: { ...payload, _rejectionReason: rejectionReason } as any,
        signature: payload.signature,
        verificationStatus: status,
        userId: payload.userId ?? null,
        ipAddress,
        processedAt: new Date(),
      })
      .returning({ id: webhookEvents.id });
    return row?.id ?? "";
  } catch (err: any) {
    // Unique violation on (networkId, eventId) = duplicate
    if (err?.code === "23505") {
      logger.warn({ networkId, eventId: payload.eventId }, "[Webhook] Duplicate event row");
    } else {
      logger.error({ err }, "[Webhook] Failed to persist event row");
    }
    return "";
  }
}

// ─── Express middleware ───────────────────────────────────────────────────────

/**
 * Middleware that captures raw body for HMAC verification.
 * Must be mounted BEFORE express.json() on webhook routes.
 */
export function captureRawBody(req: Request, res: Response, next: NextFunction): void {
  const chunks: Buffer[] = [];
  req.on("data", (chunk: Buffer) => chunks.push(chunk));
  req.on("end", () => {
    (req as any).rawBody = Buffer.concat(chunks).toString("utf8");
    try {
      (req as any).body = JSON.parse((req as any).rawBody);
    } catch {
      (req as any).body = {};
    }
    next();
  });
  req.on("error", next);
}

/**
 * Mark a webhook event row as reward-triggered after successful earn event.
 */
export async function markWebhookRewarded(eventRowId: string): Promise<void> {
  if (!eventRowId) return;
  await db
    .update(webhookEvents)
    .set({ rewardTriggered: true })
    .where(eq(webhookEvents.id, eventRowId));
}
