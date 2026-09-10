const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = "thorx1111dev@gmail.com";
  const { rows: urows } = await pool.query("SELECT id, available_balance, tx_points_balance FROM users WHERE email = $1", [email]);
  if (!urows[0]) { console.log("user not found"); process.exit(1); }
  const u = urows[0];

  // CONVERT_MIN_RS live seed (value column is JSONB → pass a string)
  await pool.query(
    `INSERT INTO system_config (key, value, description, updated_at)
     VALUES ('CONVERT_MIN_RS', '100', 'Minimum available RS a user can convert to TX-Points in one Convert transaction (Convert portal)', now())
     ON CONFLICT (key) DO NOTHING`
  );
  console.log("CONVERT_MIN_RS seeded = 100");

  // Ledger-backing row for the manual 5M credit — makes the account fully
  // ledger-valid (payout FIFO + convert FIFO + both invariants).
  const { rows: existing } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM user_transactions WHERE user_id = $1 AND withdrawn = false`,
    [u.id]
  );
  if (existing[0].n > 0) {
    console.log("user already has unwithdrawn ledger rows — skipping balancing row");
  } else {
    await pool.query(
      `INSERT INTO user_transactions
         (user_id, engine_type, points_credited, real_pkr_value, gross_pkr, thorx_profit_pkr,
          conversion_rate, card_variance, source_id, source_type, withdrawn, verification_status, verified_at)
       VALUES ($1, 'Indirect', $2, $3, '0.0000', '0.0000', 10, '1.0000', $4, 'admin_adjustment', false, 'verified', now())`,
      [u.id, u.tx_points_balance, u.available_balance, `manual:${Date.now()}`]
    );
    console.log(`ledger row inserted: PKR ${u.available_balance} + ${u.tx_points_balance} pts → account fully ledger-backed`);
  }
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
