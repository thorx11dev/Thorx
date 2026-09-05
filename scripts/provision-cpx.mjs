/**
 * CPX Research (Engine B) credential provisioning — idempotent.
 *
 * Upserts the CPX app credentials into system_config so the survey wall
 * activates (an unconfigured network is hidden from the wall AND its
 * callbacks are rejected — no secret = no reward). Matches the values the
 * admin UI (Team Portal → System Settings → Survey Networks) writes.
 *
 * Required env vars:
 *   CPX_APP_ID        CPX dashboard → General Settings → App ID (e.g. 35558)
 *   CPX_SECURE_HASH   CPX dashboard → General Settings → Security Hash
 *   DATABASE_URL      Postgres connection string
 *
 * Run:
 *   CPX_APP_ID=35558 CPX_SECURE_HASH=*** DATABASE_URL=postgres://… node scripts/provision-cpx.mjs
 *
 * Safe to re-run. Does NOT touch other networks' config.
 */
import pg from "pg";

const { Pool } = pg;

const APP_ID = (process.env.CPX_APP_ID || "").trim();
const SECURE_HASH = (process.env.CPX_SECURE_HASH || "").trim();

if (!APP_ID || !SECURE_HASH) {
  console.error("❌  CPX_APP_ID and CPX_SECURE_HASH environment variables are required.");
  console.error("    Example: CPX_APP_ID=35558 CPX_SECURE_HASH=*** node scripts/provision-cpx.mjs");
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function upsertConfig(key, value, description) {
  await pool.query(
    `INSERT INTO system_config (key, value, description, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, value, description]
  );
}

async function main() {
  const client = await pool.connect();
  try {
    // 1 — CPX credentials: { apiId, hash }
    await upsertConfig(
      "CPX_RESEARCH_CONFIG_JSON",
      JSON.stringify({ apiId: APP_ID, hash: SECURE_HASH }),
      "CPX Research credentials {apiId, hash} — wall signing + postback MD5 validation. Empty = network disabled."
    );
    console.log("  ✅  CPX_RESEARCH_CONFIG_JSON upserted (apiId + hash).");

    // 2 — Ensure cpx-research is present + active in the waterfall (preserve
    //     any other configured networks and their priorities).
    const { rows } = await client.query(
      `SELECT value FROM system_config WHERE key = 'SURVEY_NETWORKS_JSON' LIMIT 1`
    );
    let networks = [];
    if (rows[0]?.value) {
      try { networks = JSON.parse(typeof rows[0].value === "string" ? rows[0].value : JSON.stringify(rows[0].value)); } catch { networks = []; }
    }
    if (!Array.isArray(networks)) networks = [];
    const existing = networks.find((n) => n?.id === "cpx-research");
    if (existing) {
      existing.isActive = true;
      console.log("  ✅  cpx-research confirmed active in SURVEY_NETWORKS_JSON.");
    } else {
      const maxPriority = networks.reduce((m, n) => Math.max(m, Number(n?.priority ?? 0)), 0);
      networks.push({ id: "cpx-research", name: "CPX Research", priority: maxPriority + 1, isActive: true });
      console.log("  ✅  cpx-research appended to SURVEY_NETWORKS_JSON (active).");
    }
    await upsertConfig(
      "SURVEY_NETWORKS_JSON",
      JSON.stringify(networks),
      "JSON array of survey networks {id,name,priority,isActive} in waterfall order (Engine B)"
    );

    console.log("\n🎯  CPX Research is now live. Remaining manual steps (CPX dashboard):");
    console.log("   • Postback URL → https://<your-domain>/api/webhooks/survey/cpx-research?status={status}&trans_id={trans_id}&user_id={user_id}&amount_usd={amount_usd}&amount_local={amount_local}&type={type}&hash={secure_hash}");
    console.log("   • Currency Factor → must equal SURVEY_USD_TO_PKR_RATE (PKR credited per USD 1.00)");
    console.log("   • Security Check → enabled (secure_hash verification)");
    console.log("   • Test Mode → ON with Test Mode ExtUserIds while validating, OFF for launch");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌  Provisioning failed:", err.message);
  process.exit(1);
});
