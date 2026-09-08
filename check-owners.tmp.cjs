const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // Ownership of archived items (users keep these — refund decision pending)
  const own = await pool.query(
    `SELECT u.email, si.ref_key
       FROM user_store_items usi
       JOIN store_items si ON si.id = usi.item_id
       JOIN users u ON u.id = usi.user_id
      WHERE si.status = 'archived'`
  );
  console.log("archived-item owners:", own.rows.length);
  for (const r of own.rows) console.log("  ", r.email, "→", r.ref_key);

  // Any stale active state?
  const active = await pool.query(
    `SELECT uc.user_id, u.email, si.ref_key AS theme
       FROM user_customization uc
       LEFT JOIN store_items si ON si.id = uc.active_theme_item_id
       JOIN users u ON u.id = uc.user_id`
  );
  for (const r of active.rows) console.log("active-theme:", r.email, "→", r.theme ?? "default ✓");
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
