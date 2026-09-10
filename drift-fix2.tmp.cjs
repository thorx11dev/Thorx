const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = "thorx1111dev@gmail.com";
  const { rows: urows } = await pool.query(
    `SELECT u.id, u.available_balance, u.tx_points_balance,
            COALESCE((SELECT SUM(t.real_pkr_value) FROM user_transactions t WHERE t.user_id = u.id AND t.withdrawn = false), 0) AS ledger_pkr,
            COALESCE((SELECT SUM(t.points_credited) FROM user_transactions t WHERE t.user_id = u.id AND t.withdrawn = false), 0) AS ledger_pts
       FROM users u WHERE u.email = $1`, [email]
  );
  const u = urows[0];
  const driftPkr = Math.round((parseFloat(u.available_balance) - parseFloat(u.ledger_pkr)) * 100) / 100;
  const driftPts = parseInt(u.tx_points_balance) - parseInt(u.ledger_pts);
  console.log("PKR drift:", driftPkr, "| PTS drift:", driftPts);

  const uid = u.id;

  // 1 — Close the PKR drift with ledger rows that each fit numeric(10,4).
  let remaining = Math.round(driftPkr * 100); // paisa
  const CAP = 99999999; // 999,999.99 in paisa
  let part = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, CAP) / 100;
    await pool.query(
      `INSERT INTO user_transactions
         (user_id, engine_type, points_credited, real_pkr_value, gross_pkr, thorx_profit_pkr,
          conversion_rate, card_variance, source_id, source_type, withdrawn, verification_status, verified_at)
       VALUES ($1, 'Indirect', 0, $2, '0.0000', '0.0000', 10, '1.0000', $3, 'admin_adjustment', false, 'verified', now())`,
      [uid, chunk.toFixed(4), `manual-balance:${Date.now()}:${part++}`]
    );
    remaining -= Math.round(chunk * 100);
    console.log("  inserted ledger chunk:", chunk.toFixed(2));
  }

  // 2 — Close the points drift with a FIFO-immune 'converted' row.
  if (driftPts !== 0) {
    await pool.query(
      `INSERT INTO user_transactions
         (user_id, engine_type, points_credited, real_pkr_value, gross_pkr, thorx_profit_pkr,
          conversion_rate, card_variance, source_id, source_type, withdrawn, verification_status)
       VALUES ($1, 'Indirect', $2, '0.0000', '0.0000', '0.0000', 10, '1.0000', $3, 'conversion', false, 'converted')`,
      [uid, driftPts, `manual-pts:${Date.now()}`]
    );
    console.log("  inserted points-balancing row:", driftPts);
  }

  // 3 — Verify zero drift.
  const { rows: v } = await pool.query(
    `SELECT
       u.available_balance, u.tx_points_balance,
       COALESCE((SELECT SUM(t.real_pkr_value) FROM user_transactions t WHERE t.user_id = u.id AND t.withdrawn = false), 0) AS ledger_pkr,
       COALESCE((SELECT SUM(t.points_credited) FROM user_transactions t WHERE t.user_id = u.id AND t.withdrawn = false), 0) AS ledger_pts
       FROM users u WHERE u.email = $1`, [email]
  );
  const f = v[0];
  console.log("FINAL: balance", f.available_balance, "vs ledger", f.ledger_pkr, "| points", f.tx_points_balance, "vs ledger", f.ledger_pts);
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
