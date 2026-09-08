import { storage } from "./server/storage";
import { pool } from "./server/db";

async function main() {
  const { rows: urows } = await pool.query(
    `INSERT INTO users (first_name, last_name, identity, phone, email, password_hash, role)
     VALUES ('dbg', 'store', $1, '03000000000', $2, 'x', 'user')
     RETURNING id`,
    ["dbg_store_" + Date.now(), "dbg_" + Date.now() + "@test.local"]
  );
  const userId = urows[0].id;
  await pool.query("UPDATE users SET tx_points_balance = 500000 WHERE id = $1", [userId]);

  const { rows: items } = await pool.query(
    `SELECT id, ref_key, item_type, category FROM store_items WHERE ref_key IN ('theme_midnight','dashboard_cards_minimal')`
  );
  const theme = items.find((i: any) => i.item_type === "theme");
  const comp = items.find((i: any) => i.item_type === "component");

  await pool.query("INSERT INTO user_store_items (user_id, item_id) VALUES ($1,$2), ($1,$3) ON CONFLICT DO NOTHING", [userId, theme.id, comp.id]);

  await storage.activateStoreItem({ userId, itemId: theme.id });
  let own = await storage.getUserStoreOwnership(userId);
  console.log("after theme activate:", JSON.stringify(own.activeThemeItemId));

  await storage.activateStoreItem({ userId, itemId: comp.id });
  own = await storage.getUserStoreOwnership(userId);
  console.log("after comp activate: theme=" + own.activeThemeItemId + " comps=" + JSON.stringify(own.activeComponents));

  await pool.query("DELETE FROM user_customization WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM user_store_items WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM users WHERE id = $1", [userId]);
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e); process.exit(1); });
