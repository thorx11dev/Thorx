/**
 * THORX E2E Self-Test — real HTTP against a running server + real DB.
 *
 * Tests: health → login → leaderboard → 2FA full cycle (setup/enable/gate/
 * login-with-code/disable). Uses the existing tester account and RESTORES
 * its 2FA state at the end.
 *
 * Prereq: server running (local or prod) with TEST_BASE_URL + TEST_EMAIL +
 * TEST_PASSWORD env vars. Run: npx tsx scripts/e2e-selftest.mjs
 */
import { totpNow } from "../server/lib/totp";

const BASE = process.env.TEST_BASE_URL || "http://localhost:5000";
const EMAIL = process.env.TEST_EMAIL || "thorx1111dev@gmail.com";
const PASSWORD = process.env.TEST_PASSWORD || "Thorx@Tester2026";

const jar = new Map();
const results = [];
const record = (name, pass, detail = "") => results.push({ name, pass, detail });

function storeCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const eq = kv.indexOf("=");
    if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function req(method, path, body) {
  const headers = { cookie: cookieHeader() };
  if (body) headers["content-type"] = "application/json";
  const csrf = jar.get("thorx.csrf.v2");
  if (csrf) headers["x-csrf-token"] = csrf;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  storeCookies(res);
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data };
}

async function main() {
  // 1 — Health
  const health = await req("GET", "/api/health");
  record("GET /api/health = 200", health.status === 200, `status ${health.status}`);

  // 2 — Login (password only)
  const login = await req("POST", "/api/login", { email: EMAIL, password: PASSWORD });
  const sessionOk = login.status === 200 && login.data !== null;
  record("login (password) = 200", sessionOk, `status ${login.status} ${JSON.stringify(login.data)?.slice(0, 120)}`);
  if (!sessionOk) return finish();

  // 3 — Leaderboard
  const lb = await req("GET", "/api/leaderboard");
  const lbOk =
    lb.status === 200 &&
    Array.isArray(lb.data?.leaders) &&
    typeof lb.data?.totalRanked === "number";
  record(
    "GET /api/leaderboard shape OK",
    lbOk,
    lbOk ? `${lb.data.leaders.length} leaders, ${lb.data.totalRanked} ranked, me=${lb.data.me?.rank ?? "-"}` : `status ${lb.status}`,
  );
  if (lbOk && lb.data.leaders.length > 0) {
    const top = lb.data.leaders[0];
    record(
      "leaderboard privacy: no email/balance leaked",
      !JSON.stringify(top).toLowerCase().includes("email") &&
        !JSON.stringify(top).toLowerCase().includes("balance"),
    );
  }

  // 4 — 2FA cycle
  const setup = await req("POST", "/api/security/2fa/setup", {});
  const setupOk = setup.status === 200 && setup.data?.secret && setup.data?.otpauthUri?.startsWith("otpauth://");
  record("2FA setup returns secret + otpauth URI", setupOk, `status ${setup.status}`);

  if (setupOk) {
    const code1 = totpNow(setup.data.secret);
    const enable = await req("POST", "/api/security/2fa/enable", { code: code1 });
    record("2FA enable with live code = 200", enable.status === 200 && enable.data?.enabled === true, `status ${enable.status}`);

    const status = await req("GET", "/api/security/2fa/status");
    record("2FA status reports enabled", status.data?.enabled === true);

    // fresh session-less login must now demand TOTP
    jar.clear();
    const health2 = await req("GET", "/api/health");
    const gate = await req("POST", "/api/login", { email: EMAIL, password: PASSWORD });
    record(
      "login w/o code blocked with TOTP_REQUIRED",
      gate.status === 401 && gate.data?.error === "TOTP_REQUIRED",
      `status ${gate.status} error=${gate.data?.error}`,
    );

    const code2 = totpNow(setup.data.secret);
    const login2 = await req("POST", "/api/login", { email: EMAIL, password: PASSWORD, totpCode: code2 });
    record("login WITH valid code = 200", login2.status === 200, `status ${login2.status} ${JSON.stringify(login2.data)?.slice(0, 100)}`);

    const wrong = await req("POST", "/api/security/2fa/disable", { code: "000000" });
    record("disable with wrong code rejected", wrong.status === 401, `status ${wrong.status}`);

    const code3 = totpNow(setup.data.secret);
    const disable = await req("POST", "/api/security/2fa/disable", { code: code3 });
    record("disable with valid code = 200 (state restored)", disable.status === 200 && disable.data?.enabled === false, `status ${disable.status}`);

    const status2 = await req("GET", "/api/security/2fa/status");
    record("2FA status reports disabled after cleanup", status2.data?.enabled === false);
  }

  return finish();
}

function finish() {
  console.log(`\n══════════════ E2E SELF-TEST vs ${BASE} ══════════════`);
  let failed = 0;
  for (const r of results) {
    if (!r.pass) failed++;
    console.log(` ${r.pass ? "PASS ✅" : "FAIL ❌"}  ${r.name}${r.pass || !r.detail ? "" : ` — ${r.detail}`}`);
  }
  console.log("══════════════════════════════════════════════════════");
  console.log(failed === 0 ? `\nRESULT: ALL ${results.length} CHECKS PASSED 🚀\n` : `\nRESULT: ${failed}/${results.length} FAILED\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("E2E fatal:", err.message);
  finish();
});
