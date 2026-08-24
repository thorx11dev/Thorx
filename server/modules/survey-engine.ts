/**
 * THORX Engine B — Survey Network Waterfall (6 networks).
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
 *   • CPX Research     — MD5(trans_id + app_secure_hash)
 *   • BitLabs          — SHA-1 HMAC (hex) of the URI minus &hash=…, keyed with App Secret
 *   • TimeWall         — HMAC-SHA256(secret, user_id + transaction_id + amount)
 *   • PrimeSurveys     — HMAC-SHA256(api_key, user_id + transaction_id + amount)
 *   • TheoremReach     — SHA3-256(callback_url + query_params + secret_key) in enc= param
 *   • Lootably         — SHA256(userID + ip + revenue + currencyReward + postbackSecret)
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
  hash?: string;
}

interface BitLabsCredentials {
  appToken?: string;
  secret?: string;
}

interface TimeWallCredentials {
  siteId?: string;
  secret?: string;
}

interface PrimeSurveysCredentials {
  appId?: string;
  apiKey?: string;
}

interface TheoremReachCredentials {
  companyId?: string;
  secretKey?: string;
}

interface LootablyCredentials {
  placementId?: string;
  postbackSecret?: string;
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

async function getTimeWallCredentials(): Promise<TimeWallCredentials> {
  const raw = await storage.getSystemConfigValue<unknown>("TIMEWALL_CONFIG_JSON", {});
  return parseJson<TimeWallCredentials>(raw, {});
}

async function getPrimeSurveysCredentials(): Promise<PrimeSurveysCredentials> {
  const raw = await storage.getSystemConfigValue<unknown>("PRIMESURVEYS_CONFIG_JSON", {});
  return parseJson<PrimeSurveysCredentials>(raw, {});
}

async function getTheoremReachCredentials(): Promise<TheoremReachCredentials> {
  const raw = await storage.getSystemConfigValue<unknown>("THEOREMREACH_CONFIG_JSON", {});
  return parseJson<TheoremReachCredentials>(raw, {});
}

async function getLootablyCredentials(): Promise<LootablyCredentials> {
  const raw = await storage.getSystemConfigValue<unknown>("LOOTABLY_CONFIG_JSON", {});
  return parseJson<LootablyCredentials>(raw, {});
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

/** Optional profile hints vendors use for duplicate-matching and targeting. */
export interface SurveyUserProfile {
  email?: string | null;
  username?: string | null;
}

/**
 * Build the signed entry URL for one network, or mark it unavailable when its
 * credentials are not configured yet.
 *
 * When `userId` is provided, networks that support signed wall links get a
 * per-user digest embedded so the vendor can verify the request origin.
 */
export async function buildSurveyWallEntry(
  network: SurveyNetworkConfig,
  userId?: string,
  profile?: SurveyUserProfile,
): Promise<SurveyWallEntry> {
  // ── CPX Research ──────────────────────────────────────────────────────────
  if (network.id === "cpx-research") {
    const creds = await getCpxCredentials();
    if (!creds.apiId) {
      logger.debug({ networkId: network.id }, "[Surveys] CPX Research not configured — hidden from wall");
      return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
    }
    const url = new URL("https://offers.cpx-research.com/index.php");
    url.searchParams.set("app_id", creds.apiId);
    url.searchParams.set("ext_user_id", "__UID__");
    if (userId && creds.hash) {
      const secureHash = crypto
        .createHash("md5")
        .update(`${userId}-${creds.hash}`, "utf8")
        .digest("hex");
      url.searchParams.set("secure_hash", secureHash);
    }
    // CPX docs mark email/username as "Recommended": without email, CPX prompts
    // the user mid-wall and duplicate-profile matching stays weak — both shrink
    // matchable inventory ("no survey for your profile").
    if (profile?.email) url.searchParams.set("email", profile.email);
    if (profile?.username) url.searchParams.set("username", profile.username);
    return { networkId: network.id, networkName: network.name, wallUrl: url.toString(), available: true };
  }

  // ── BitLabs ───────────────────────────────────────────────────────────────
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

  // ── TimeWall ──────────────────────────────────────────────────────────────
  // TimeWall offers surveys + micro-tasks + PTC via a single widget embed.
  // The site owner URL pattern: https://timewall.io/widget/{siteId}?user_id={USER_ID}
  if (network.id === "timewall") {
    const creds = await getTimeWallCredentials();
    if (!creds.siteId) {
      logger.debug({ networkId: network.id }, "[Surveys] TimeWall not configured — hidden from wall");
      return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
    }
    const url = new URL(`https://timewall.io/widget/${creds.siteId}`);
    url.searchParams.set("user_id", "__UID__");
    return { networkId: network.id, networkName: network.name, wallUrl: url.toString(), available: true };
  }

  // ── PrimeSurveys ──────────────────────────────────────────────────────────
  // PrimeSurveys: iframe integration with user_id and app_key.
  // URL pattern: https://primesurveys.com/survey/{appId}?user_id={USER_ID}
  if (network.id === "primesurveys") {
    const creds = await getPrimeSurveysCredentials();
    if (!creds.appId) {
      logger.debug({ networkId: network.id }, "[Surveys] PrimeSurveys not configured — hidden from wall");
      return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
    }
    const url = new URL(`https://primesurveys.com/survey/${creds.appId}`);
    url.searchParams.set("user_id", "__UID__");
    return { networkId: network.id, networkName: network.name, wallUrl: url.toString(), available: true };
  }

  // ── TheoremReach ──────────────────────────────────────────────────────────
  // TheoremReach: iframe / new-tab entry. Wall URL is provided in their
  // publisher dashboard after creating an app. The entry URL contains a
  // {USER_ID} placeholder that we substitute server-side.
  // Standard pattern: https://theoremreach.com/p/{companyId}?u={USER_ID}
  if (network.id === "theoremreach") {
    const creds = await getTheoremReachCredentials();
    if (!creds.companyId) {
      logger.debug({ networkId: network.id }, "[Surveys] TheoremReach not configured — hidden from wall");
      return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
    }
    const url = new URL(`https://theoremreach.com/p/${creds.companyId}`);
    url.searchParams.set("u", "__UID__");
    return { networkId: network.id, networkName: network.name, wallUrl: url.toString(), available: true };
  }

  // ── Lootably ──────────────────────────────────────────────────────────────
  // Lootably: iframe or direct link. Offers + surveys hybrid.
  // Docs: https://documentation.lootably.com/docs/offerwall-integration
  // URL pattern: https://uberwall.co/pub/{placementID}?userid={USER_ID}
  if (network.id === "lootably") {
    const creds = await getLootablyCredentials();
    if (!creds.placementId) {
      logger.debug({ networkId: network.id }, "[Surveys] Lootably not configured — hidden from wall");
      return { networkId: network.id, networkName: network.name, wallUrl: "", available: false };
    }
    const url = new URL(`https://uberwall.co/pub/${creds.placementId}`);
    url.searchParams.set("userid", "__UID__");
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
 * keyed with the App Secret.
 */
export function verifyBitLabsHash(params: URLSearchParams, originalPath: string, secret: string): CallbackVerification {
  const received = params.get("hash") ?? "";
  if (!received) return { ok: false, reason: "Missing hash parameter" };

  const stripped = new URLSearchParams(params);
  stripped.delete("hash");

  const queryOnly = stripped.toString();
  const candidates = [
    `${originalPath}${queryOnly ? `?${queryOnly}` : ""}`,
    queryOnly,
  ];

  for (const candidate of candidates) {
    const expected = crypto.createHmac("sha1", secret).update(candidate, "utf8").digest("hex");
    if (safeHexEqual(expected, received)) return { ok: true };
  }

  logger.warn({ candidates }, "[Surveys][BitLabs] Hash mismatch");
  return { ok: false, reason: "Invalid BitLabs hash" };
}

/**
 * CPX Research postback hash verification.
 * Formula: MD5(trans_id + app_secure_hash)
 * Source: CPX Dashboard → Edit App → POSTBACK SETTINGS
 */
export function verifyCpxHash(params: URLSearchParams, creds: CpxResearchCredentials): CallbackVerification {
  const received = params.get("hash") ?? "";
  if (!received) return { ok: false, reason: "Missing hash parameter" };
  if (!creds.hash) return { ok: false, reason: "CPX Research app secure hash not configured" };

  const transId = params.get("trans_id") ?? "";

  const expected = crypto
    .createHash("md5")
    .update(`${transId}${creds.hash}`, "utf8")
    .digest("hex");
  if (safeHexEqual(expected, received)) return { ok: true }

  const expectedDash = crypto
    .createHash("md5")
    .update(`${transId}-${creds.hash}`, "utf8")
    .digest("hex");
  if (safeHexEqual(expectedDash, received)) return { ok: true };

  return { ok: false, reason: "Invalid CPX Research hash" };
}

/**
 * TimeWall callback hash verification.
 * Formula: HMAC-SHA256(secret, user_id + transaction_id + amount)
 * TimeWall sends: user_id, transaction_id, amount, hash, status
 */
function verifyTimeWallHash(params: URLSearchParams, creds: TimeWallCredentials): CallbackVerification {
  const received = params.get("hash") ?? "";
  if (!received) return { ok: false, reason: "Missing hash parameter" };
  if (!creds.secret) return { ok: false, reason: "TimeWall secret not configured" };

  const userId = params.get("user_id") ?? "";
  const txId = params.get("transaction_id") ?? "";
  const amount = params.get("amount") ?? "";

  const payload = `${userId}${txId}${amount}`;
  const expected = crypto.createHmac("sha256", creds.secret).update(payload, "utf8").digest("hex");
  if (safeHexEqual(expected, received)) return { ok: true }

  // Fallback: some TimeWall versions use dash separators
  const payloadDash = `${userId}-${txId}-${amount}`;
  const expectedDash = crypto.createHmac("sha256", creds.secret).update(payloadDash, "utf8").digest("hex");
  if (safeHexEqual(expectedDash, received)) return { ok: true };

  return { ok: false, reason: "Invalid TimeWall hash" };
}

/**
 * PrimeSurveys callback hash verification.
 * Formula: HMAC-SHA256(api_key, user_id + transaction_id + amount)
 * Similar pattern to TimeWall — industry standard for survey offerwalls.
 */
export function verifyPrimeSurveysHash(params: URLSearchParams, creds: PrimeSurveysCredentials): CallbackVerification {
  const received = params.get("hash") ?? "";
  if (!received) return { ok: false, reason: "Missing hash parameter" };
  if (!creds.apiKey) return { ok: false, reason: "PrimeSurveys API key not configured" };

  const userId = params.get("user_id") ?? "";
  const txId = params.get("transaction_id") ?? "";
  const amount = params.get("amount") ?? "";

  const payload = `${userId}${txId}${amount}`;
  const expected = crypto.createHmac("sha256", creds.apiKey).update(payload, "utf8").digest("hex");
  if (safeHexEqual(expected, received)) return { ok: true }

  const payloadDash = `${userId}-${txId}-${amount}`;
  const expectedDash = crypto.createHmac("sha256", creds.apiKey).update(payloadDash, "utf8").digest("hex");
  if (safeHexEqual(expectedDash, received)) return { ok: true };

  return { ok: false, reason: "Invalid PrimeSurveys hash" };
}

/**
 * TheoremReach callback hash verification.
 * They redirect users back with: result, transaction_id, enc (hash).
 * Hash = SHA3-256 of (callback_url_with_query_params_without_enc + secret_key)
 * Or alternatively via IP whitelisting.
 *
 * For web redirects, the hash is computed over the full redirect URL.
 */
export function verifyTheoremReachHash(
  params: URLSearchParams,
  originalPath: string,
  creds: TheoremReachCredentials,
): CallbackVerification {
  const received = params.get("enc") ?? "";
  if (!received) return { ok: false, reason: "Missing enc (hash) parameter" };
  if (!creds.secretKey) return { ok: false, reason: "TheoremReach secret key not configured" };

  // Build the URL without the enc parameter for hashing
  const stripped = new URLSearchParams(params);
  stripped.delete("enc");
  const queryOnly = stripped.toString();
  const fullUrl = `${originalPath}${queryOnly ? `?${queryOnly}` : ""}`;

  // TheoremReach uses SHA3-256 (or SHA3-512 depending on dashboard config)
  // Try SHA3-256 first (default per their docs)
  const expected256 = crypto.createHash("sha3-256").update(`${fullUrl}${creds.secretKey}`, "utf8").digest("hex");
  if (safeHexEqual(expected256, received)) return { ok: true }

  // Fallback: SHA3-512 (some configurations use this)
  const expected512 = crypto.createHash("sha3-512").update(`${fullUrl}${creds.secretKey}`, "utf8").digest("hex");
  if (safeHexEqual(expected512, received)) return { ok: true }

  return { ok: false, reason: "Invalid TheoremReach hash" };
}

/**
 * Lootably postback hash verification.
 * Docs: https://documentation.lootably.com/docs/postbacks
 * Formula: SHA256(userID + ip + revenue + currencyReward + postbackSecret)
 */
export function verifyLootablyHash(params: URLSearchParams, creds: LootablyCredentials): CallbackVerification {
  const received = params.get("hash") ?? "";
  if (!received) return { ok: false, reason: "Missing hash parameter" };
  if (!creds.postbackSecret) return { ok: false, reason: "Lootably postback secret not configured" };

  const userId = params.get("userID") ?? "";
  const ip = params.get("ip") ?? "";
  const revenue = params.get("revenue") ?? "";
  const currencyReward = params.get("currencyReward") ?? "";

  const payload = `${userId}${ip}${revenue}${currencyReward}${creds.postbackSecret}`;
  const expected = crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  if (safeHexEqual(expected, received)) return { ok: true }

  return { ok: false, reason: "Invalid Lootably hash" };
}

/** Route-level dispatch: verifies the callback came from the named network. */
export async function verifySurveyCallback(
  networkId: string,
  params: URLSearchParams,
  originalPath: string,
): Promise<CallbackVerification> {
  switch (networkId) {
    case "bitlabs": {
      const creds = await getBitLabsCredentials();
      if (!creds.secret) return { ok: false, reason: "BitLabs secret not configured — refusing reward" };
      return verifyBitLabsHash(params, originalPath, creds.secret);
    }
    case "cpx-research": {
      const creds = await getCpxCredentials();
      if (!creds.apiId || !creds.hash) return { ok: false, reason: "CPX Research credentials not configured — refusing reward" };
      return verifyCpxHash(params, creds);
    }
    case "timewall": {
      const creds = await getTimeWallCredentials();
      if (!creds.siteId || !creds.secret) return { ok: false, reason: "TimeWall credentials not configured — refusing reward" };
      return verifyTimeWallHash(params, creds);
    }
    case "primesurveys": {
      const creds = await getPrimeSurveysCredentials();
      if (!creds.appId || !creds.apiKey) return { ok: false, reason: "PrimeSurveys credentials not configured — refusing reward" };
      return verifyPrimeSurveysHash(params, creds);
    }
    case "theoremreach": {
      const creds = await getTheoremReachCredentials();
      if (!creds.companyId || !creds.secretKey) return { ok: false, reason: "TheoremReach credentials not configured — refusing reward" };
      return verifyTheoremReachHash(params, originalPath, creds);
    }
    case "lootably": {
      const creds = await getLootablyCredentials();
      if (!creds.placementId || !creds.postbackSecret) return { ok: false, reason: "Lootably credentials not configured — refusing reward" };
      return verifyLootablyHash(params, creds);
    }
    default:
      return { ok: false, reason: `Unknown survey network: ${networkId}` };
  }
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

  switch (networkId) {
    case "bitlabs":
      userId = firstParam(params, ["uid", "user_id"]);
      txId = firstParam(params, ["tx", "trans_id", "transaction_id"]);
      usdRaw = firstParam(params, ["usd", "amount_usd", "reward_usd"]);
      break;

    case "cpx-research":
      userId = firstParam(params, ["user_id", "uid", "ext_user_id"]);
      txId = firstParam(params, ["trans_id", "tx", "transaction_id"]);
      usdRaw = firstParam(params, ["currency_amount", "usd", "amount_usd"]);
      break;

    case "timewall":
      userId = firstParam(params, ["user_id", "uid"]);
      txId = firstParam(params, ["transaction_id", "trans_id", "tx"]);
      usdRaw = firstParam(params, ["amount", "amount_usd", "reward_usd"]);
      break;

    case "primesurveys":
      userId = firstParam(params, ["user_id", "uid"]);
      txId = firstParam(params, ["transaction_id", "trans_id", "tx"]);
      usdRaw = firstParam(params, ["amount", "amount_usd", "reward_usd", "currencyReward"]);
      break;

    case "theoremreach":
      // TheoremReach sends transaction_id and result code (10 = complete).
      // Reward amount comes from our config or the survey details.
      // For S2S postback: transaction_id, result, and optionally amount.
      userId = firstParam(params, ["user_id", "uid", "ext_user_id"]);
      txId = firstParam(params, ["transaction_id", "trans_id"]);
      usdRaw = firstParam(params, ["amount", "amount_usd", "reward", "payout"]);
      break;

    case "lootably":
      // Docs: https://documentation.lootably.com/docs/postbacks
      // Params: {userID}, {transactionID}, {currencyReward}, {revenue}, {status}
      userId = firstParam(params, ["userID", "user_id"]);
      txId = firstParam(params, ["transactionID", "transaction_id", "trans_id"]);
      // currencyReward is the user-facing reward amount
      usdRaw = firstParam(params, ["currencyReward", "revenue", "amount"]);
      break;

    default:
      return null;
  }

  const rewardUsd = Number.parseFloat(usdRaw);
  if (!userId || !txId || !Number.isFinite(rewardUsd) || rewardUsd <= 0) {
    return null;
  }
  return { userId, txId, rewardUsd };
}
