const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Restore BITLABS_CONFIG_JSON to bootstrap default ("{}") — survey-callback
  // tests leaked test creds (bitlabs_test_token) into this DB. BitLabs was
  // never configured by the user; "{}" hides it from the wall until real keys.
  await pool.query(
    `UPDATE system_config SET value = '{}', updated_at = now() WHERE key = 'BITLABS_CONFIG_JSON'`
  );
  console.log("BITLABS_CONFIG_JSON reset to {} (test creds removed)");

  const { rows } = await pool.query(
    `SELECT key, value FROM system_config WHERE key = 'BITLABS_CONFIG_JSON'`
  );
  console.log("verified:", rows[0].key, "=", JSON.stringify(rows[0].value));
  await pool.end();
}

main().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
