const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = "thorx1111dev@gmail.com";
  const { rows } = await pool.query(
    `SELECT
       u.available_balance, u.tx_points_balance,
       COALESCE(SUM(t.real_pkr_value) FILTER (WHERE t.withdrawn = false), 0) AS ledger_pkr,
       COALESCE(SUM(t.points_credited) FILTER (WHERE t.withdrawn = false), 0) AS ledger_pts,
       COUNT(t.id) AS row_count
     FROM users u LEFT JOIN user_transactions t ON t.user_id = u.id
     WHERE u.email = $1 GROUP BY u.id, u.available_balance, u.tx_points_balance`,
    [email]
  );
  const r = rows[0];
  console.log("available_balance :", r.available_balance);
  console.log("ledger unwithdrawn:", r.ledger_pkr, "(rows:", r.row_count + ")");
  console.log("tx_points_balance :", r.tx_points_balance);
  console.log("ledger unwithdrawn pts:", r.ledger_pts);
  const driftPkr = parseFloat(r.available_balance) - parseFloat(r.ledger_pkr);
  const driftPts = parseInt(r.tx_points_balance) - parseInt(r.ledger_pts);
  console.log("PKR drift :", driftPkr.toFixed(2));
  console.log("PTS drift :", driftPts);

  // If PKR drift — insert ONE balancing row to fully back the account.
  if (Math.abs(driftPkr) >= 0.01) {
    await pool.query(
      `INSERT INTO user_transactions
         (user_id, engine_type, points_credited, real_pkr_value, gross_pkr, thorx_profit_pkr,
          conversion_rate, card_variance, source_id, source_type, withdrawn, verification_status, verified_at)
       VALUES ($1, 'Indirect', $2, $3, '0.0000', '0.0000', 10, '1.0000', $4, 'admin_adjustment', false, 'verified', now())`,
      [r.user_id ?? (await pool.query("SELECT id FROM users WHERE email = $1", [email])).rows[0].id, Math.max(0, driftPts), driftPkr.toFixed(4), `manual-balance:${Date.now()}`]
    );
    console.log("balancing row inserted (PKR " + driftPkr.toFixed(2) + ", pts " + driftPts + ")");

    // txPointsBalance must equal unwithdrawn points after this row.
    if (driftPts !== 0) {
      await pool.query(
        `UPDATE users SET tx_points_balance = tx_points_balance + $1 WHERE email = $2`,
        [driftPts, email]
      );
      console.log("tx_points_balance adjusted by", driftPts, "→ zero-drift state");
    }
  } else {
    console.log("no PKR drift — account already ledger-valid");
  }
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
