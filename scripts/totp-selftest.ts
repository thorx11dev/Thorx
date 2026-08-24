/**
 * THORX TOTP Self-Test — RFC 4226/6238 official vectors + behavioral checks.
 * Run: npx tsx scripts/totp-selftest.ts   (no DB needed)
 */
import { base32Decode, base32Encode, buildOtpauthUri, totpNow, verifyTotp } from "../server/lib/totp";
import crypto from "node:crypto";

const results: Array<{ name: string; pass: boolean; detail?: string }> = [];
const record = (name: string, pass: boolean, detail?: string) =>
  results.push({ name, pass, detail });

// ── RFC 4226 Appendix D vectors ──────────────────────────────────────────────
// Secret = ASCII "12345678901234567890" → base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
// HOTP(counter=1) = 287082 (6-digit truncation of the RFC's 94287082 @ T=59s)
{
  const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  const code = totpNow(secret, 59_000); // T=59s → counter=1
  record("RFC vector: T=59s code = 287082", code === "287082", `got ${code}`);

  const code2 = totpNow(secret, 1111111109_000); // counter = 37037036 → RFC 081804 (6-digit of 07081804)
  record("RFC vector: T=1111111109s code = 081804", code2 === "081804", `got ${code2}`);
}

// ── base32 roundtrip ──────────────────────────────────────────────────────────
{
  const bytes = crypto.randomBytes(20);
  const round = base32Decode(base32Encode(bytes));
  record("base32 encode/decode roundtrip", round.equals(bytes));
}

// ── verify: current code accepted, drift ±1 accepted with window=1 ───────────
{
  const secret = "JBSWY3DPEHPK3PXP";
  const now = Date.now();
  record("current code accepted", verifyTotp(secret, totpNow(secret, now), 1, now));
  record("previous step code accepted (window=1)", verifyTotp(secret, totpNow(secret, now - 31_000), 1, now));
  record("next step code accepted (window=1)", verifyTotp(secret, totpNow(secret, now + 31_000), 1, now));
  record("2 steps old code rejected (window=1)", !verifyTotp(secret, totpNow(secret, now - 61_000), 1, now));
  record("garbage code rejected", !verifyTotp(secret, "abcdef", 1, now));
  record("empty code rejected", !verifyTotp(secret, "", 1, now));
  record("7-digit code rejected", !verifyTotp(secret, "1234567", 1, now));
  record("spaces inside code normalized+accepted", verifyTotp(secret, totpNow(secret, now).replace(/(\d{3})/, "$1 "), 1, now));
}

// ── otpauth URI shape ─────────────────────────────────────────────────────────
{
  const uri = buildOtpauthUri("JBSWY3DPEHPK3PXP", "aon@thorx.site");
  record(
    "otpauth URI well-formed",
    uri.startsWith("otpauth://totp/THORX%3Aaon%40thorx.site?") &&
      uri.includes("secret=JBSWY3DPEHPK3PXP") &&
      uri.includes("issuer=THORX") &&
      uri.includes("digits=6") &&
      uri.includes("period=30"),
    uri,
  );
}

// ── report ────────────────────────────────────────────────────────────────────
console.log("\n══════════════ TOTP SELF-TEST ══════════════");
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(` ${r.pass ? "PASS ✅" : "FAIL ❌"}  ${r.name}${r.pass ? "" : ` — ${r.detail ?? ""}`}`);
}
console.log("════════════════════════════════════════════");
console.log(failed === 0 ? `\nRESULT: ALL ${results.length} CHECKS PASSED — 2FA production-ready! 🔐\n` : `\nRESULT: ${failed} FAILED!\n`);
process.exit(failed === 0 ? 0 : 1);
