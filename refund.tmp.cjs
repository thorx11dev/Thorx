const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const email = "thorx1111dev@gmail.com";
  // Refund points for archived-generation purchases owned by this account.
  const refund = await pool.query(
    `WITH refunded AS (
        SELECT usi.id, si.price_points
          FROM user_store_items usi
          JOIN store_items si ON si.id = usi.item_id
          JOIN users u ON u.id = usi.user_id
         WHERE u.email = $1 AND si.status = 'archived'
     )
     UPDATE users
        SET tx_points_balance = tx_points_balance + (SELECT COALESCE(SUM(price_points),0) FROM refunded)
      WHERE users.id = (SELECT id FROM users WHERE email = $1)
     RETURNING tx_points_balance`,
    [email]
  );
  console.log("refunded balance now:", refund.rows[0]?.tx_points_balance);

  // Clear the ownership rows (items are gone from the catalog).
  await pool.query(
    `DELETE FROM user_store_items
      WHERE item_id IN (SELECT id FROM store_items WHERE status = 'archived')
        AND user_id = (SELECT id FROM users WHERE email = $1)`,
    [email]
  );
  console.log("archived ownership rows cleared for", email);
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
