import { storage } from "./server/storage";
import { pool } from "./server/db";

async function main() {
  const { rows } = await pool.query(
    `SELECT usi.user_id, usi.item_id, si.ref_key FROM user_store_items usi JOIN store_items si ON si.id = usi.item_id WHERE si.item_type = 'theme' LIMIT 1`
  );
  if (!rows[0]) { console.log("no owner found"); process.exit(0); }
  const { user_id, item_id, ref_key } = rows[0];
  console.log("user:", user_id, "theme:", ref_key);

  const before = await storage.getUserStoreOwnership(user_id);
  console.log("before deactivate:", JSON.stringify(before.activeThemeItemId));

  const after = await storage.deactivateStoreItem({ userId: user_id, itemId: item_id });
  console.log("deactivate result:", JSON.stringify(after));

  await storage.activateStoreItem({ userId: user_id, itemId: item_id });
  const restored = await storage.getUserStoreOwnership(user_id);
  console.log("restored:", JSON.stringify(restored.activeThemeItemId));
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e); process.exit(1); });
