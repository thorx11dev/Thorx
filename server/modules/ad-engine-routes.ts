/**
 * THORX Engine A — Real Rewarded Ads (Phase 2).
 *
 * Registers the routes that turn Engine A's watch flow into a REAL rewarded
 * ads pipeline with server-side reward verification:
 *
 *   POST /api/ads/session
 *     Authenticated. Inserts a pending ad_view row (completed=false) and
 *     returns a signed one-time session token. When the Ad Router has an
 *     active network with a zone, the response also carries the real
 *     anti-adblock embed code so the client renders an actual ad instead of a
 *     simulated timer. No credit happens here.
 *
 *   POST /api/ad-view
 *     Session-aware version, registered (from registerRoutes) BEFORE the
 *     legacy handler in routes.ts so Express routes this path to it. With a
 *     valid sessionToken it completes the pending row exactly once and credits
 *     Engine A; the legacy adId path (simulated inventory) is preserved.
 *
 *   POST /api/webhooks/ad-complete/:networkId
 *     Public (CSRF-exempt) network callback. verifyWebhook() enforces HMAC
 *     signature (per-network secret from WEBHOOK_SECRETS_JSON), one-time
 *     eventId replay protection, a 5-minute timestamp window, and PK-only
 *     country. Only after verification does the session complete and the user
 *     get credited. Golden Rule: no verification = no reward.
 *
 * All credit paths share the advisory-locked transaction plus the
 * uniq_user_transactions_source partial unique index, so a reward can never
 * be minted twice — neither by replaying a session token nor by re-sending a
 * webhook event.
 */

import type { Express, Request } from "express";
import { db } from "../db";
import { adViews } from "@shared/schema";
import { eq, and, ne, sql, desc } from "drizzle-orm";
import { storage } from "../storage";
import { earnRateLimiter } from "../middleware/auth-rate-limit";
import { requireSessionAuth } from "../routes";
import { hilltopAdsService } from "../hilltopads-service";
import { createAdSessionToken, verifyAdSessionToken } from "./ad-session";
import { verifyWebhook, markWebhookRewarded, type WebhookPayload } from "./webhook-verifier";
import { logger } from "../lib/logger";

function getThorxPrincipalId(req: Request): string | undefined {
  return (req as any).session?.userId;
}

// ─── Runtime ad inventory (mirrors routes.ts getAdInventory) ─────────────────
// AD_INVENTORY_JSON lives in system_config so rewards/durations change without
// a code deployment. 60-second TTL cache.
interface AdItem { reward: string; duration: number; type: string }
let _adInventoryCache: Record<string, AdItem> | null = null;
let _adInventoryCacheExpiry = 0;
const AD_INVENTORY_TTL_MS = 60_000;

async function getAdInventory(): Promise<Record<string, AdItem>> {
  if (_adInventoryCache && Date.now() < _adInventoryCacheExpiry) return _adInventoryCache;
  try {
    const raw = await storage.getSystemConfigValue<any>("AD_INVENTORY_JSON", []);
    const items: any[] = Array.isArray(raw) ? raw : JSON.parse(String(raw));
    const map: Record<string, AdItem> = {};
    for (const item of items) {
      if (item?.id) {
        map[item.id] = {
          reward: String(item.reward ?? "0.02"),
          duration: Number(item.duration ?? 5),
          type: String(item.type ?? "network"),
        };
      }
    }
    if (!map["hilltop_fallback"]) map["hilltop_fallback"] = { reward: "0.02", duration: 5, type: "network" };
    _adInventoryCache = map;
    _adInventoryCacheExpiry = Date.now() + AD_INVENTORY_TTL_MS;
    return map;
  } catch {
    return { hilltop_fallback: { reward: "0.02", duration: 5, type: "network" } };
  }
}

async function countCompletedToday(userId: string, tx: any = db): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [row] = await tx
    .select({ n: sql<number>`COUNT(*)` })
    .from(adViews)
    .where(and(
      eq(adViews.userId, userId),
      eq(adViews.completed, true),
      sql`${adViews.createdAt} >= ${todayStart}`,
    ));
  return Number(row?.n ?? 0);
}

export function registerAdEngineRoutes(app: Express): void {
  // ── Issue a real rewarded-ad session ─────────────────────────────────────
  app.post("/api/ads/session", requireSessionAuth, earnRateLimiter, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const inventory = await getAdInventory();
      const dailyCap = await storage.getSystemConfigValue<number>("MAX_ADS_PER_DAY", 20);

      // Don't mint sessions for users who have already hit the daily cap.
      if ((await countCompletedToday(thorxPid)) >= dailyCap) {
        return res.status(429).json({
          message: "Daily ad limit reached. Come back tomorrow to earn more.",
          error: "DAILY_LIMIT",
        });
      }

      // Ad selection: prefer a REAL active network via the Ad Router (has a
      // zone); fall back to the simulated inventory when nothing is wired.
      let networkId = "internal";
      let zoneId: string | null = null;
      let adCode: string | null = null;
      try {
        const { getAdRouterRecommendation } = await import("./ad-router");
        const rec = await getAdRouterRecommendation(true);
        const primary = rec.rankedNetworks.find((n) => n.isActive && n.zoneId && n.zoneId !== "default")
          ?? rec.rankedNetworks.find((n) => n.isActive);
        if (primary?.isActive && primary.zoneId && primary.zoneId !== "default") {
          networkId = primary.networkId;
          zoneId = primary.zoneId;
          const code = await hilltopAdsService.getAntiAdBlockCode(primary.zoneId);
          if (code) adCode = code;
        }
      } catch {
        // Network lookup failure is non-fatal — fall back to simulated ads.
      }

      const requestedId = (req.body as any)?.adId;
      const sim = (requestedId && inventory[requestedId]) || inventory["hilltop_fallback"];
      const adId = adCode ? `network_${networkId}` : sim === inventory[requestedId] ? requestedId : "hilltop_fallback";
      const duration = sim.duration || 5;

      const [row] = await db.insert(adViews).values({
        userId: thorxPid,
        adId,
        adType: "video",
        duration,
        completed: false,
        earnedAmount: sim.reward,
        adNetwork: networkId,
        ipAddress: req.ip ?? null,
        userAgent: req.headers["user-agent"] ?? null,
      }).returning();

      const token = createAdSessionToken(row.id, thorxPid);

      res.status(201).json({
        success: true,
        sessionId: row.id,
        token,
        adId,
        reward: sim.reward,
        duration,
        networkId,
        zoneId,
        adCode,
      });
    } catch (error) {
      logger.error({ err: error }, "Create ad session error");
      res.status(500).json({ message: "Failed to create ad session", error: "INTERNAL_ERROR" });
    }
  });

  // ── Session-aware ad completion (registered before the legacy handler) ────
  app.post("/api/ad-view", requireSessionAuth, earnRateLimiter, async (req, res) => {
    try {
      const thorxPid = getThorxPrincipalId(req) as string;
      const dailyCap = await storage.getSystemConfigValue<number>("MAX_ADS_PER_DAY", 20);
      const { adId, sessionToken } = (req.body ?? {}) as { adId?: string; sessionToken?: string };

      // Resolve the server-issued session (if any): the token binds this
      // credit to a specific pending ad_view row + user.
      let session: { sid: string } | null = null;
      let pendingRow: typeof adViews.$inferSelect | null = null;
      if (sessionToken) {
        const payload = verifyAdSessionToken(sessionToken);
        if (!payload) {
          return res.status(400).json({ message: "Invalid or expired ad session.", error: "INVALID_SESSION" });
        }
        if (payload.uid !== thorxPid) {
          return res.status(403).json({ message: "This ad session belongs to another account.", error: "FORBIDDEN" });
        }
        session = { sid: payload.sid };
        const [row] = await db.select().from(adViews).where(eq(adViews.id, payload.sid)).limit(1);
        pendingRow = row ?? null;
        if (!pendingRow || pendingRow.userId !== thorxPid) {
          return res.status(400).json({ message: "Ad session not found.", error: "INVALID_SESSION" });
        }
        if (pendingRow.completed) {
          return res.status(409).json({ message: "This ad session has already been used.", error: "SESSION_CONFLICT" });
        }
      }

      const inventory = await getAdInventory();
      const adConfig = session && pendingRow
        ? {
            reward: pendingRow.earnedAmount,
            duration: pendingRow.duration ?? 30,
            type: pendingRow.adType,
          }
        : (inventory[adId || ""] || inventory["hilltop_fallback"]);

      // Unknown adIds are never credited (no silent fallback to THORX's pocket).
      if (!session && !inventory[adId || ""]) {
        return res.status(400).json({ message: "This ad is not available right now.", error: "INVALID_AD" });
      }

      let adViewRow: any;
      let thorxCard: { pointsCredited: number; engineType: string } | null = null;
      let timingFailed = false;
      let dailyCapExceeded = false;
      let sessionConflict = false;

      try {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${thorxPid})::bigint)`);

          // Timing guard: the user must wait the ad duration since their last
          // COMPLETED view. The pending session row is excluded — it was just
          // created and must not count as the "previous" view.
          const lastViews = await tx
            .select({ createdAt: adViews.createdAt })
            .from(adViews)
            .where(and(
              eq(adViews.userId, thorxPid),
              session ? ne(adViews.id, session.sid) : undefined,
            ))
            .orderBy(desc(adViews.createdAt))
            .limit(1);

          if (lastViews.length > 0 && lastViews[0].createdAt) {
            const timeSinceLastAd = (Date.now() - new Date(lastViews[0].createdAt).getTime()) / 1000;
            if (timeSinceLastAd < (adConfig.duration - 2)) {
              timingFailed = true;
              throw new Error("TIMING_FAIL");
            }
          }

          if ((await countCompletedToday(thorxPid, tx)) >= dailyCap) {
            dailyCapExceeded = true;
            throw new Error("DAILY_CAP");
          }

          if (session && pendingRow) {
            // Phase 2: flip the pending row to completed. The guarded UPDATE
            // (completed=false) means a concurrent webhook or client that won
            // the race leaves zero rows — one credit per session, guaranteed.
            const [updated] = await tx.update(adViews)
              .set({ completed: true })
              .where(and(eq(adViews.id, session.sid), eq(adViews.completed, false)))
              .returning();
            if (!updated) {
              sessionConflict = true;
              throw new Error("SESSION_ALREADY_USED");
            }
            adViewRow = updated;
          } else {
            // Legacy path: insert the completed row in the same transaction.
            const [inserted] = await tx.insert(adViews).values({
              userId: thorxPid,
              adId: adId || "hilltop_fallback",
              adType: adConfig.type,
              duration: adConfig.duration,
              completed: true,
              earnedAmount: adConfig.reward,
            }).returning();
            adViewRow = inserted;
          }

          // uniq_user_transactions_source prevents a duplicate ledger row if
          // the same sourceId is ever submitted twice (defense-in-depth).
          const earnResult = await storage.recordEarnEvent({
            userId: thorxPid,
            engineType: "Engine_A",
            grossPkr: adConfig.reward,
            sourceId: adViewRow.id,
            sourceType: "ad_view",
            tx,
          });
          if (earnResult.pointsCredited > 0) {
            thorxCard = {
              pointsCredited: earnResult.pointsCredited,
              engineType: "Engine_A",
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
            error: "RATE_LIMITED",
          });
        }
        if (sessionConflict) {
          return res.status(409).json({
            message: "This ad session has already been used.",
            error: "SESSION_CONFLICT",
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
          : "Ad viewed — TX-Points credited",
      });
    } catch (error) {
      logger.error({ err: error }, "Create ad view error");
      res.status(500).json({ message: "Failed to record ad view", error: "INTERNAL_ERROR" });
    }
  });

  // ── Server-side reward verification webhook ──────────────────────────────
  app.post("/api/webhooks/ad-complete/:networkId", async (req, res) => {
    try {
      const networkId = req.params.networkId;
      const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
      const body = (req.body ?? {}) as WebhookPayload & { sessionToken?: string };

      const result = await verifyWebhook(
        networkId,
        rawBody,
        (req.headers["x-webhook-signature"] as string) || body.signature,
        req.ip ?? "",
        body,
      );
      if (!result.ok) {
        return res.status(result.statusCode).json({ message: result.reason, error: "WEBHOOK_REJECTED" });
      }

      const session = verifyAdSessionToken(body.sessionToken);
      if (!session) {
        return res.status(400).json({ message: "Missing or invalid session token.", error: "INVALID_SESSION" });
      }

      const [pending] = await db.select().from(adViews).where(eq(adViews.id, session.sid)).limit(1);
      if (!pending || pending.userId !== session.uid) {
        return res.status(400).json({ message: "Ad session not found.", error: "INVALID_SESSION" });
      }
      if (pending.completed) {
        return res.status(409).json({ message: "Ad session already completed.", error: "SESSION_CONFLICT" });
      }

      let credited = false;
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${pending.userId})::bigint)`);
        const [updated] = await tx.update(adViews)
          .set({ completed: true, adNetwork: networkId })
          .where(and(eq(adViews.id, pending.id), eq(adViews.completed, false)))
          .returning();
        if (!updated) return; // lost the race — another completion already credited
        const earnResult = await storage.recordEarnEvent({
          userId: pending.userId,
          engineType: "Engine_A",
          grossPkr: pending.earnedAmount,
          sourceId: pending.id,
          sourceType: "ad_view",
          tx,
        });
        credited = earnResult.pointsCredited > 0;
      });

      if (credited) {
        await markWebhookRewarded(result.eventRowId);
        // Feed the Ad Router's performance scoring with the real completion.
        try {
          const { recordNetworkCompletion } = await import("./ad-router");
          await recordNetworkCompletion(networkId, networkId, parseFloat(pending.earnedAmount ?? "0"));
        } catch {
          // Stats recording is best-effort — never fail the webhook ack.
        }
      }

      return res.status(200).json({ success: true, credited });
    } catch (error) {
      logger.error({ err: error }, "Ad webhook error");
      return res.status(500).json({ message: "Failed to process webhook", error: "INTERNAL_ERROR" });
    }
  });
}
