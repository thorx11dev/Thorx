/**
 * THORX Survey Crypto Self-Test
 * ---------------------------------------------------------------
 * Har survey network ke S2S signature formula independently compute
 * karke hamare real verifier functions se compare karta hai.
 *
 * PASS = hamara implementation vendor docs ke mutabiq hai
 * FAIL = formula drift / bug — integration se pehle fix zaroori
 *
 * Run: npx tsx scripts/survey-crypto-selftest.ts
 * (No DB access needed — pure crypto layer testing.)
 */

import crypto from "node:crypto";
import {
  verifyBitLabsHash,
  verifyCpxHash,
  verifyTimeWallHash,
  verifyPrimeSurveysHash,
  verifyTheoremReachHash,
  verifyLootablyHash,
} from "../server/modules/survey-engine";

const PATH_BITLABS = "/api/webhooks/survey/bitlabs";
const PATH_THEOREM = "/api/webhooks/survey/theoremreach";

type Check = { name: string; pass: boolean; detail: string };

const results: Check[] = [];

function record(name: string, ok: boolean, detail: string) {
  results.push({ name, pass: ok, detail });
}

// ── CPX Research: MD5(trans_id + secure_hash) ────────────────────────────────
{
  const creds = { apiId: "12345", hash: "cpx-secret-hash" };
  const transId = "cpx-tx-001";
  const good = crypto.createHash("md5").update(`${transId}${creds.hash}`).digest("hex");
  const p1 = new URLSearchParams({ trans_id: transId, hash: good });
  const r1 = verifyCpxHash(p1, creds);
  record("CPX Research : valid MD5 signature", r1.ok, r1.reason ?? "accepted");

  const p2 = new URLSearchParams({ trans_id: "TAMPERED", hash: good });
  const r2 = verifyCpxHash(p2, creds);
  record("CPX Research : tampered tx rejected", !r2.ok, r2.ok ? "ACCEPTED TAMPERED!" : r2.reason ?? "");
}

// ── BitLabs: HMAC-SHA1(path?query-minus-hash, appSecret) ─────────────────────
{
  const secret = "bitlabs-app-secret";
  const base = new URLSearchParams({ uid: "user-42", amount: "0.80", txn: "bl-tx-7" });
  const stripped = new URLSearchParams(base);
  const queryOnly = stripped.toString();
  const signed = crypto.createHmac("sha1", secret).update(`${PATH_BITLABS}?${queryOnly}`).digest("hex");
  const p1 = new URLSearchParams(base);
  p1.set("hash", signed);
  const r1 = verifyBitLabsHash(p1, PATH_BITLABS, secret);
  record("BitLabs      : valid HMAC-SHA1 signature", r1.ok, r1.reason ?? "accepted");

  const p2 = new URLSearchParams(base);
  p2.set("hash", "deadbeef");
  const r2 = verifyBitLabsHash(p2, PATH_BITLABS, secret);
  record("BitLabs      : forged hash rejected", !r2.ok, r2.ok ? "ACCEPTED FORGERY!" : r2.reason ?? "");
}

// ── TimeWall: HMAC-SHA256(secret, user_id + transaction_id + amount) ─────────
{
  const creds = { siteId: "site-9", secret: "timewall-secret" };
  const base = { user_id: "user-42", transaction_id: "tw-tx-3", amount: "1.25" };
  const payload = `${base.user_id}${base.transaction_id}${base.amount}`;
  const sig = crypto.createHmac("sha256", creds.secret).update(payload).digest("hex");
  const p1 = new URLSearchParams({ ...base, hash: sig });
  const r1 = verifyTimeWallHash(p1, creds);
  record("TimeWall     : valid HMAC-SHA256 signature", r1.ok, r1.reason ?? "accepted");

  const badAmount = new URLSearchParams({ ...base, amount: "9.99", hash: sig });
  const r2 = verifyTimeWallHash(badAmount, creds);
  record("TimeWall     : inflated amount rejected", !r2.ok, r2.ok ? "ACCEPTED INFLATED!" : r2.reason ?? "");
}

// ── PrimeSurveys: HMAC-SHA256(api_key, user_id + transaction_id + amount) ────
{
  const creds = { appId: "app-77", apiKey: "prime-api-key" };
  const base = { user_id: "user-42", transaction_id: "ps-tx-5", amount: "0.60" };
  const payload = `${base.user_id}${base.transaction_id}${base.amount}`;
  const sig = crypto.createHmac("sha256", creds.apiKey).update(payload).digest("hex");
  const p1 = new URLSearchParams({ ...base, hash: sig });
  const r1 = verifyPrimeSurveysHash(p1, creds);
  record("PrimeSurveys : valid HMAC-SHA256 signature", r1.ok, r1.reason ?? "accepted");

  const wrongKey = { appId: "app-77", apiKey: "attacker-key" };
  const p2 = new URLSearchParams({ ...base, hash: sig });
  const r2 = verifyPrimeSurveysHash(p2, wrongKey);
  record("PrimeSurveys : wrong key rejected", !r2.ok, r2.ok ? "ACCEPTED WRONG KEY!" : r2.reason ?? "");
}

// ── TheoremReach: SHA3-256(url-without-enc + secretKey) ──────────────────────
{
  const creds = { companyId: "comp-5", secretKey: "theorem-secret" };
  const base = new URLSearchParams({ u: "user-42", transaction_id: "tr-tx-9", result: "1" });
  const fullUrl = `${PATH_THEOREM}?${base.toString()}`;
  const enc = crypto.createHash("sha3-256").update(`${fullUrl}${creds.secretKey}`).digest("hex");
  const p1 = new URLSearchParams(base);
  p1.set("enc", enc);
  const r1 = verifyTheoremReachHash(p1, PATH_THEOREM, creds);
  record("TheoremReach : valid SHA3-256 signature", r1.ok, r1.reason ?? "accepted");

  const p2 = new URLSearchParams(base);
  p2.set("enc", "forged");
  const r2 = verifyTheoremReachHash(p2, PATH_THEOREM, creds);
  record("TheoremReach : forged enc rejected", !r2.ok, r2.ok ? "ACCEPTED FORGERY!" : r2.reason ?? "");
}

// ── Lootably: SHA256(userID + ip + revenue + currencyReward + postbackSecret)─
{
  const creds = { placementId: "place-3", postbackSecret: "lootably-secret" };
  const base = { userID: "user-42", ip: "39.50.1.2", revenue: "0.75", currencyReward: "75" };
  const payload = `${base.userID}${base.ip}${base.revenue}${base.currencyReward}${creds.postbackSecret}`;
  const hash = crypto.createHash("sha256").update(payload).digest("hex");
  const p1 = new URLSearchParams({ ...base, hash });
  const r1 = verifyLootablyHash(p1, creds);
  record("Lootably     : valid SHA256 signature", r1.ok, r1.reason ?? "accepted");

  const spoofIp = { ...base, ip: "1.2.3.4" };
  const p2 = new URLSearchParams({ ...spoofIp, hash });
  const r2 = verifyLootablyHash(p2, creds);
  record("Lootably     : spoofed IP rejected", !r2.ok, r2.ok ? "ACCEPTED SPOOF!" : r2.reason ?? "");
}

// ── Report ────────────────────────────────────────────────────────────────────
console.log("\n══════════════ SURVEY CRYPTO SELF-TEST ══════════════");
let failed = 0;
for (const r of results) {
  const mark = r.pass ? "PASS ✅" : "FAIL ❌";
  if (!r.pass) failed++;
  console.log(` ${mark}  ${r.name}`);
}
console.log("══════════════════════════════════════════════════════");
console.log(failed === 0 ? `\nRESULT: ALL ${results.length} CHECKS PASSED — saare 6 networks production-ready! 🚀\n` : `\nRESULT: ${failed} FAILED — integration se pehle fix karo!\n`);
process.exit(failed === 0 ? 0 : 1);
