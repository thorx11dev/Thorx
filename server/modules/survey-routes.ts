/**
 * THORX Engine B — Survey routes.
 *
 *   GET /api/surveys
 *     Authenticated. Returns the configured survey-network waterfall (only
 *     networks with real credentials are marked available), the user's
 *     today-progress against SURVEY_MAX_PER_DAY, and the SURVEY_MIN_RANK
 *     eligibility verdict. The client renders each available network as a
 *     wall button; the wall URL embeds the user's THORX id.
 *
 *   GET|POST /api/webhooks/survey/:networkId
 *     Public (CSRF-exempt via the /api/webhooks/ rule) network callback.
 *     BitLabs delivers callbacks as GET; CPX Research as GET or POST — both
 *     verbs are accepted. Verification order: signature → params → dedup →
 *     daily cap → guarded insert + recordEarnEvent inside one advisory-locked
 *     transaction. Valid callbacks always get a 200 so vendors stop retrying;
 *     rejections use 4xx exactly like the ad-complete webhook.
 */

import type { Express, Request } from "express";
import Decimal from "decimal.js";
import { db } from "../db";
import { surveyRecords } from "@shared/schema";
import { storage } from "../storage";
import { requireSessionAuth } from "../routes";
import { logger } from "../lib/logger";
import { sql } from "drizzle-orm";
import {
  buildSurveyWallEntry,
  countSurveysCompletedToday,
  getActiveSurveyNetworks,
  getSurveyDailyCap,
  getSurveyMinRank,
  normalizeSurveyCallback,
  rankAtLeast,
  verifySurveyCallback,
} from "./survey-engine";

function getThorxPrincipalId(req: Request): string | undefined {
  return (req as any).session?.userId;
}

function callbackParams(req: Request): URLSearchParams {
  // GET callbacks carry everything in the query; some vendors POST form bodies.
  if (req.method === "POST" && req.body && typeof req.body === "object" && Object.keys(req.body).length > 0) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
      if (value !== null && value !== undefined) params.set(key, String(value));
    }
    return params;
  }
  const rawQuery = req.url.includes("?") ? req.url.slice(req.url.indexOf("?") + 1) : "";
  return new URLSearchParams(rawQuery);
}

/** Path-only form of the request URL (query stripped) for hash canonicalization. */
function callbackPath(req: Request): string {
  const original: string = (req as any).originalUrl || req.url || "";
  return original.includes("?") ? original.slice(0, original.indexOf("?")) : original;
}

// Reversal/pending events (TimeWall type=chargeback|hold|rejected, generic
// status=rejected, etc.) must be acknowledged with 200 so the vendor stops
// retrying, but they must NEVER credit a user. "hold" is followed by a final
// credit/rejected postback, so acknowledging it costs nothing.
const REVERSAL_VALUES = new Set(["chargeback", "reversed", "rejected", "refund", "refunded", "denied", "deny", "hold"]);

function firstReversalSignal(params: URLSearchParams): string | null {
  for (const key of ["type", "status", "event"]) {
    const value = (params.get(key) ?? "").trim().toLowerCase();
    if (value && REVERSAL_VALUES.has(value)) return `${key}=${value}`;
  }
  return null;
}

export function registerSurveyRoutes(app: Express): void {
  // ── Survey wall (user-facing) ─────────────────────────────────────────────
  app.get("/api/surveys", requireSessionAuth, async (req, res) => {
    try {
      const userId = getThorxPrincipalId(req) as string;
      const user = await storage.getUserById(userId);
      if (!user) return res.status(401).json({ error: "NO_SESSION" });

      const minRank = await getSurveyMinRank();
      const eligible = rankAtLeast(user.userRankTier, minRank);
      const dailyCap = await getSurveyDailyCap();
      const completedToday = await countSurveysCompletedToday(userId);

      let networks: Awaited<ReturnType<typeof buildSurveyWallEntry>>[] = [];
      if (eligible && completedToday < dailyCap) {
        const active = await getActiveSurveyNetworks();
        // userId is passed so CPX's signed-wall digest (secure_hash) can be
        // computed server-side per user — the secret never leaves the server.
        // Profile hints (email/username) boost vendor-side survey matching.
        networks = await Promise.all(
          active.map((n) =>
            buildSurveyWallEntry(n, userId, {
              email: user.email,
              username: user.identity,
            }),
          ),
        );
        networks = networks.map((n) => ({
          ...n,
          wallUrl: n.available ? n.wallUrl.replace("__UID__", encodeURIComponent(userId)) : "",
        }));
      }

      res.json({
        eligible,
        minRank,
        completedToday,
        dailyCap,
        networks, // only `available: true` entries carry a wallUrl
      });
    } catch (error) {
      logger.error({ err: error }, "[Surveys] Failed to load survey wall");
      res.status(500).json({ message: "Failed to load surveys", error: "INTERNAL_ERROR" });
    }
  });

  // ── Network S2S callback ───────────────────────────────────────────────────
  const handleSurveyCallback = async (req: Request, res: any) => {
    const networkId = req.params.networkId;
    try {
      const params = callbackParams(req);
      const originalPath = callbackPath(req);

      // 1 — Signature: no configured secret ⇒ reject. No exceptions.
      const verification = await verifySurveyCallback(networkId, params, originalPath);
      if (!verification.ok) {
        logger.warn({ networkId, reason: verification.reason }, "[Surveys] Callback rejected");
        return res.status(401).json({ credited: false, error: "CALLBACK_REJECTED", reason: verification.reason });
      }

      // 1.5 — Reversal events (TimeWall `type=chargeback`, generic `status=rejected`,
      // etc.): acknowledge with 200 so vendors stop retrying, but never credit.
      const reversal = firstReversalSignal(params);
      if (reversal) {
        logger.warn({ networkId, reversal }, "[Surveys] Reversal callback acknowledged — no credit");
        return res.status(200).json({ credited: false, ignored: "REVERSAL_EVENT", reason: reversal });
      }

      // 2 — Params → normalized payload.
      const payload = normalizeSurveyCallback(networkId, params);
      if (!payload) {
        return res.status(400).json({ credited: false, error: "INVALID_PARAMS" });
      }

      // 2.5 — Handle BitLabs-specific callback types
      if (networkId === "bitlabs" && payload.surveyType) {
        // SCREENOUT: user was disqualified from survey — no credit, just acknowledge
        if (payload.isScreenout) {
          logger.info({ networkId, txId: payload.txId, userId: payload.userId, reason: payload.surveyReason }, "[Surveys][BitLabs] Screenout acknowledged — no credit");
          return res.status(200).json({ credited: false, ignored: "SCREENOUT", reason: payload.surveyReason });
        }

        // RECONCILIATION: survey reward was revoked (fraud/quality) — negative amount, ref to original tx
        if (payload.isReconciliation) {
          logger.warn({ networkId, txId: payload.txId, refTxId: payload.refTxId, amount: payload.rewardUsd }, "[Surveys][BitLabs] Reconciliation callback — reversing previous credit");
          
          // For reconciliation, we need to reverse the previous credit
          const reconciliationAmount = Math.abs(payload.rewardUsd);
          if (reconciliationAmount > 0) {
            // Reverse the previous credit by recording a negative earn event
            await storage.recordEarnEvent({
              userId: payload.userId,
              engineType: "Engine_B",
              grossPkr: `-${Math.abs(payload.rewardUsd).toFixed(4)}`,
              sourceId: payload.txId,
              sourceType: "survey_reconciliation",
              tx,
            });
            // Also update the original survey record to mark as reconciled
            await db
              .update(surveyRecords)
              .set({ status: "reconciled" })
              .where(sql`${surveyRecords.transactionId} = ${payload.refTxId || payload.txId}`);
          }
          return res.status(200).json({ credited: false, ignored: "RECONCILIATION", refTxId: payload.refTxId });
        }

        // START_BONUS: treat like COMPLETE — credit the user
        if (payload.isStartBonus) {
          logger.info({ networkId, txId: payload.txId, userId: payload.userId }, "[Surveys][BitLabs] Start bonus callback — processing as COMPLETE");
          // Fall through to normal credit flow
        }

        // COMPLETE: normal credit flow (falls through to existing logic)
      }

      // 3 — Credit path: one advisory-locked transaction; duplicate TX and
      // daily-cap races resolve to an idempotent 200 (vendors retry until 200).
      let credited = false;
      // Holder object instead of a bare let: TypeScript resets narrowing on
      // object properties after the awaited transaction call, so the closure's
      // assignments stay visible to the post-transaction branch below.
      const result: { outcome: "credited" | "duplicate" | "daily_cap" | "user_not_found" } = { outcome: "credited" };

      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${payload.userId})::bigint)`);

        const [record] = await tx
          .insert(surveyRecords)
          .values({
            userId: payload.userId,
            networkId,
            transactionId: payload.txId,
            status: "completed",
            rewardUsd: payload.rewardUsd.toFixed(4),
            grossPkr: new Decimal(payload.rewardUsd)
              .mul(await storage.getSystemConfigValue<number>("SURVEY_USD_TO_PKR_RATE", 278))
              .toDecimalPlaces(4, Decimal.ROUND_DOWN)
              .toFixed(4),
            completedAt: new Date(),
          })
          // uniq_survey_network_tx (partial unique index) — a retried callback
          // lands here with no row returned and no double credit.
          .onConflictDoNothing()
          .returning();

        if (!record) {
          result.outcome = "duplicate";
          return;
        }

        const cap = await storage.getSystemConfigValue<number>("SURVEY_MAX_PER_DAY", 20);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const [done] = await tx
          .select({ n: sql<number>`COUNT(*)` })
          .from(surveyRecords)
          .where(sql`${surveyRecords.userId} = ${payload.userId}
              AND ${surveyRecords.status} = 'completed'
              AND ${surveyRecords.completedAt} >= ${todayStart}`);
        if (Number(done?.n ?? 0) > cap) {
          // Over cap: remove this record again and refuse the credit.
          result.outcome = "daily_cap";
          await tx.delete(surveyRecords).where(sql`${surveyRecords.id} = ${record.id}`);
          return;
        }

        const earnResult = await storage.recordEarnEvent({
          userId: payload.userId,
          engineType: "Engine_B",
          grossPkr: record.grossPkr ?? "0",
          sourceId: record.id,
          sourceType: "survey",
          tx,
        });
        credited = earnResult.pointsCredited >= 0; // earn event committed
      });

      if (result.outcome !== "credited") {
        logger.info({ networkId, txId: payload.txId, outcome: result.outcome }, "[Surveys] Callback acknowledged without credit");
        return res.json({ credited: false, reason: result.outcome.toUpperCase() });
      }

      logger.info({ networkId, txId: payload.txId, userId: payload.userId }, "[Surveys] Callback credited");
      res.json({ credited, message: "Survey completion recorded" });
    } catch (error: any) {
      if (error?.code === "23505") {
        // Concurrent duplicate across connections — already handled by the
        // in-tx conflict guard; treat as acknowledged duplicate.
        return res.json({ credited: false, reason: "DUPLICATE" });
      }
      logger.error({ err: error, networkId }, "[Surveys] Callback processing failed");
      // Non-200 makes BitLabs retry (their documented backoff); correct for
      // transient faults while verified duplicates never reach here.
      res.status(500).json({ credited: false, error: "INTERNAL_ERROR" });
    }
  };

  app.get("/api/webhooks/survey/:networkId", handleSurveyCallback);
  app.post("/api/webhooks/survey/:networkId", handleSurveyCallback);
}
