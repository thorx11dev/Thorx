/**
 * THORX Engine B — Survey Network Waterfall (CPX Research / BitLabs).
 *
 * Turns Engine B from manual CPA tasks into an automated survey pipeline.
 * Everything money-related flows through the EXISTING earn pipeline:
 *
 *   network S2S callback (GET or POST)
 *     → verifyCallbackSignature()   [per-network secret; no secret = reject]
 *     → normalizeCallback()         [vendor params → {userId, txId, rewardUsd}]
 *     → guarded survey_records insert (uniq_survey_network_tx dedup)
 *     → storage.recordEarnEvent(Engine_B)  [splits/referral/PS/rank untouched]
 *
 * Golden Rule (same as Engine A webhooks): no verification = no reward.
 * A network whose credentials are not configured is filtered out of the wall
 * AND its callbacks are rejected — a stub must never be able to mint credit.
 *
 * Callback signature schemes (per vendor docs):
 *   • BitLabs  — `hash` param = HEX-encoded SHA-1 HMAC of the complete URI
 *     (with the &hash=… portion removed) keyed with the App Secret.
 *     Source: developer.bitlabs.ai/docs/callbacks ("Callback parameters").
 *   • CPX Research — `hash` param = MD5(trans_id + user_id + currency_amount
 *     + api_hash). ⚠ CONFIRM AT ACTIVATION: CPX's exact concatenation order /
 *     separators are only visible inside their publisher dashboard docs; the
 *     verifier below isolates that single expression so activation is a
 *     one-line change if their dashboard specifies a different canonical form.
 */

import crypto from "crypto";
import { db } from "../db";
import { surveyRecords } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";

// ─── Config shapes ────────────────────────────────────────────────────────────

export interface SurveyNetworkConfig {
  id: string;
  name: string;
  priority: number;
  isActive: boolean;
}

interface CpxResearchCredentials {
  apiId?: string;
  hash?: string; // api hash key — used for postback MD5 validation
}

interface BitLabsCredentials {
  appToken?: string; // wall URL token
  secret?: string; // callback HMAC secret
}

export interface NormalizedSurveyCallback {
  userId: string;
  txId: string;
  rewardUsd: number;
}

export type CallbackVerification =
  | { ok: true }
  | { ok: false; reason: string };

// ─── Config helpers ───────────────────────────────────────────────────────────

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw && typeof raw === "object") return raw as T;
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Waterfall order: active networks sorted by priority (lower = first). */
export async function getActiveSurveyNetworks(): Promise<SurveyNetworkConfig[]> {
  const raw = await storage.getSystemConfigValue<unknown>("SURVEY_NETWORKS_JSON", []);
  const list = parseJson<SurveyNetworkConfig[]>(raw, []);
  return list
    .filter((n) => n?.id && n.isActive)
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

async function getCpxCredentials(): Promise<CpxResearchCredentials> {
  const raw = await storage.getSystemConfigValue<unknown>("CPX_RESEARCH_CONFIG_JSON", {});
  return parseJson<CpxResearchCredentials>(raw, {});
}

async function getBitLabsCredentials(): Promise<BitLabsCredentials> {
  const raw = await storage.getSystemConfigValue<unknown>("BITLABS_CONFIG_JSON", {});
  return parseJson<BitLabsCredentials>(raw, {});
}

const RANK_ORDER = ["E-Rank", "D-Rank", "C-Rank", "B-Rank", "A-Rank", "S-Rank"];

/**
 * Minimum PS rank tier allowed to open the survey wall.
 * SURVEY_MIN_RANK (default E-Rank during beta so every user can earn).
 */
export async function getSurveyMinRank(): Promise<string> {
  const minRank = await storage.getSystemConfigValue<string>("SURVEY_MIN_RANK", "E-Rank");
  return RANK_ORDER.includes(minRank) ? minRank : "E-Rank";
}

export function rankAtLeast(userTier: string | null | undefined, minTier: string): boolean {
  const u = RANK_ORDER.indexOf(userTier ?? "E-Rank");
  const m = RANK_ORDER.indexOf(minTier);
  return u >= Math.max(0, m);
}

/** Completed surveys credited to this user since local midnight. */
export async function countSurveysCompletedToday(userId: string): Promise<number> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [row] = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(surveyRecords)
    .where(and(
      eq(surveyRecords.userId, userId),
      eq(surveyRecords.status, "completed"),
      sql`${surveyRecords.completedAt} >= ${todayStart}`,
    ));
  return Number(row?.n ?? 0);
}

export async function getSurveyDailyCap(): Promise<number> {
  return storage.getSystemConfigValue<number>("SURVEY_MAX_PER_DAY", 20);
}

// ─── Wall URLs (user-facing entry links) ─────────────────────────────────────

export interface SurveyWallEntry {
  networkId: string;
  networkName: string;
  wallUrl: string;
  available: boolean; // false when credentials missing — client hides it
}

/**
 * Build the signed entry URL for one network, or mark it unavailable when its
 * credentials are not configured yet.
 */
export async function buildSurveyWallEntry(network: SurveyNetworkConfig): Promise<SurveyWallEntry> {
  if (network.id === "cpx-research") {
    const creds = await getCpxCredentials();
    if (!creds.apiId) {
      logger.debug({ networkId: network.id }, "[Surveys] CPX Research not configured — hidden from wall");
      return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
    }
    // Open-wall format (standard during integration testing). User-id tampering
    // on this link can only misroute credit to another THORX account — never
    // mint extra credit (the postback is validated + capped server-side).
    // TODO(activation): add CPX's signed-wall MD5 once confirmed in dashboard docs.
    const url = new URL("https://walls.cpx-research.com/index.php");
    url.searchParams.set("app_id", creds.apiId);
    url.searchParams.set("ext_user_id", "{THORX_USER_ID}");
    return {
      networkId: network.id,
      networkName: network.name,
      wallUrl: url.toString().replace("{THORX_USER_ID}", "__UID__"),
      available: true,
    };
  }

  if (network.id === "bitlabs") {
    const creds = await getBitLabsCredentials();
    if (!creds.appToken) {
      logger.debug({ networkId: network.id }, "[Surveys] BitLabs not configured — hidden from wall");
      return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
    }
    const url = new URL("https://wall.bitlabs.ai/");
    url.searchParams.set("token", creds.appToken);
    url.searchParams.set("uid", "__UID__");
    return { networkId: network.id, networkName: network.name, wallUrl: url.toString(), available: true };
  }

  return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
}

// ─── Callback signature verification ─────────────────────────────────────────

/** Constant-time hex digest comparison. */
function safeHexEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a.toLowerCase(), "utf8");
  const bb = Buffer.from(b.toLowerCase(), "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/**
 * BitLabs: hash = SHA-1 HMAC (hex) of the complete URI minus the hash param,
 * keyed with the App Secret. Behind proxies the "complete URI" seen by Express
 * may differ from what BitLabs signed (scheme/host), so we accept a match on
 * either the full path+query form or the bare query-string form — both are
 * computed over the identical param set, so an attacker cannot mix them.
 */
function verifyBitLabsHash(params: URLSearchParams, originalPath: string, secret: string): CallbackVerification {
  const received = params.get("hash") ?? "";
  if (!received) return { ok: false, reason: "Missing hash parameter" };

  const stripped = new URLSearchParams(params);
  stripped.delete("hash");

  const queryOnly = stripped.toString();
  const candidates = [
    `${originalPath}${queryOnly ? `?${queryOnly}` : ""}`, // path + query
    queryOnly, // bare query string
  ];

  for (const candidate of candidates) {
    const expected = crypto.createHmac("sha1", secret).update(candidate, "utf8").digest("hex");
    if (safeHexEqual(expected, received)) return { ok: true };
  }

  logger.warn({ candidates }, "[Surveys][BitLabs] Hash mismatch — check proxy/URI canonicalization");
  return { ok: false, reason: "Invalid BitLabs hash" };
}

/**
 * CPX Research: hash = MD5(trans_id + user_id + currency_amount + api_hash).
 * ⚠ Single source of truth for the concatenation — confirm against the
 * publisher dashboard at account activation and adjust ONLY here.
 */
function verifyCpxHash(params: URLSearchParams, creds: CpxResearchCredentials): CallbackVerification {
  const received = params.get("hash") ?? "";
  if (!received) return { ok: false, reason: "Missing hash parameter" };
  if (!creds.hash) return { ok: false, reason: "CPX Research api hash not configured" };

  const transId = params.get("trans_id") ?? "";
  const userId = params.get("user_id") ?? "";
  const currencyAmount = params.get("currency_amount") ?? "";

  const expected = crypto
    .createHash("md5")
    .update(`${transId}${userId}${currencyAmount}${creds.hash}`, "utf8")
    .digest("hex");
  if (!safeHexEqual(expected, received)) {
    return { ok: false, reason: "Invalid CPX Research hash" };
  }
  return { ok: true };
}

/** Route-level dispatch: verifies the callback came from the named network. */
export async function verifySurveyCallback(
  networkId: string,
  params: URLSearchParams,
  originalPath: string,
): Promise<CallbackVerification> {
  if (networkId === "bitlabs") {
    const creds = await getBitLabsCredentials();
    if (!creds.secret) return { ok: false, reason: "BitLabs secret not configured — refusing reward" };
    return verifyBitLabsHash(params, originalPath, creds.secret);
  }
  if (networkId === "cpx-research") {
    const creds = await getCpxCredentials();
    if (!creds.apiId || !creds.hash) return { ok: false, reason: "CPX Research credentials not configured — refusing reward" };
    return verifyCpxHash(params, creds);
  }
  return { ok: false, reason: `Unknown survey network: ${networkId}` };
}

// ─── Param normalization (defensive aliasing across vendor versions) ─────────

function firstParam(params: URLSearchParams, names: string[]): string {
  for (const name of names) {
    const value = params.get(name);
    if (value !== null && value !== "") return value;
  }
  return "";
}

export function normalizeSurveyCallback(
  networkId: string,
  params: URLSearchParams,
): NormalizedSurveyCallback | null {
  let userId = "";
  let txId = "";
  let usdRaw = "";

  if (networkId === "bitlabs") {
    userId = firstParam(params, ["uid", "user_id"]);
    txId = firstParam(params, ["tx", "trans_id", "transaction_id"]);
    usdRaw = firstParam(params, ["usd", "amount_usd", "reward_usd"]);
  } else if (networkId === "cpx-research") {
    userId = firstParam(params, ["user_id", "uid", "ext_user_id"]);
    txId = firstParam(params, ["trans_id", "tx", "transaction_id"]);
    usdRaw = firstParam(params, ["currency_amount", "usd", "amount_usd"]);
  } else {
    return null;
  }

  const rewardUsd = Number.parseFloat(usdRaw);
  if (!userId || !txId || !Number.isFinite(rewardUsd) || rewardUsd <= 0) {
    return null;
  }
  return { userId, txId, rewardUsd };
}
