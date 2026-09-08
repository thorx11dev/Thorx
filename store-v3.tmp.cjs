const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  // 1 — Archive ALL themes (store sells components only now).
  const old = await pool.query(
    `UPDATE store_items SET status = 'archived', updated_at = now()
     WHERE item_type = 'theme' AND status != 'archived'
     RETURNING ref_key`
  );
  console.log("themes archived:", old.rows.map(r => r.ref_key).join(", ") || "none");

  // 2 — Archive old-generation component variants.
  const oldC = await pool.query(
    `UPDATE store_items SET status = 'archived', updated_at = now()
     WHERE item_type = 'component' AND status != 'archived'
       AND ref_key IN ('dashboard_cards_serif','dashboard_cards_mono','dashboard_cards_sticker')
     RETURNING ref_key`
  );
  console.log("old variants archived:", oldC.rows.map(r => r.ref_key).join(", ") || "none");

  // 3 — Clear stale activations pointing at archived items.
  await pool.query(
    `UPDATE user_customization uc
       SET active_theme_item_id = NULL, updated_at = now()
      WHERE uc.active_theme_item_id IN (SELECT id FROM store_items WHERE status = 'archived')`
  );
  await pool.query(
    `UPDATE user_customization uc
       SET active_components_json = (
             SELECT COALESCE(jsonb_object_agg(k, v), '{}'::jsonb)
               FROM jsonb_each_text(uc.active_components_json) e(k, v)
              WHERE v NOT IN (SELECT id FROM store_items WHERE status = 'archived')
           ), updated_at = now()
      WHERE EXISTS (
        SELECT 1 FROM jsonb_each_text(uc.active_components_json) e(k, v)
        JOIN store_items si ON si.id = v
        WHERE si.status = 'archived'
      )`
  );

  // 4 — Refund TX-Points for archived purchases + clear those ownership rows.
  const refund = await pool.query(
    `WITH victims AS (
        SELECT usi.user_id, usi.id AS ownership_id, si.price_points
          FROM user_store_items usi
          JOIN store_items si ON si.id = usi.item_id
         WHERE si.status = 'archived'
     )
     UPDATE users u
        SET tx_points_balance = tx_points_balance + (SELECT COALESCE(SUM(price_points),0) FROM victims v WHERE v.user_id = u.id)
      WHERE EXISTS (SELECT 1 FROM victims v WHERE v.user_id = u.id)
     RETURNING u.email, u.tx_points_balance`
  );
  for (const r of refund.rows) console.log("refund →", r.email, "=", r.tx_points_balance);
  await pool.query(
    `DELETE FROM user_store_items
      WHERE item_id IN (SELECT id FROM store_items WHERE status = 'archived')`
  );
  console.log("archived ownership rows cleared");

  // 5 — Seed the 4 brand-polished variants.
  const seed = `
  INSERT INTO store_items (item_type, ref_key, title, description, category, price_points, status, featured, sort_order)
  VALUES
    ('component', 'dashboard_cards_ember', 'Ember Focus', 'The flagship card treatment: a paper-to-ember gradient face, a hairline ember ring and micro-labels in THORX orange. Depth that whispers, never shouts.', 'dashboard_cards', 40000, 'published', true, 10),
    ('component', 'dashboard_cards_slab', 'Ink Slab', 'A chunky 2.5px ink frame with a hard offset shadow that snaps to THORX orange on hover. Maximum presence, zero softness — the statement treatment.', 'dashboard_cards', 30000, 'published', false, 20),
    ('component', 'dashboard_cards_hairline', 'Hairline Precision', 'Editorial measurement: the card box disappears, replaced by a single strong top rule, THORX-orange micro-labels and oversized ink numerals. Pure data, print rhythm.', 'dashboard_cards', 25000, 'published', false, 30),
    ('component', 'dashboard_cards_depth', 'Soft Depth', 'The calm everyday driver: borders gone, replaced by two layers of whisper-soft elevation and a hairline ember underline that blooms in on hover.', 'dashboard_cards', 20000, 'published', false, 40)
  ON CONFLICT (ref_key) DO NOTHING;`;
  await pool.query(seed);

  const { rows } = await pool.query(
    `SELECT ref_key, title, price_points, status FROM store_items WHERE status = 'published' ORDER BY sort_order`
  );
  console.log("\nlive catalog (components only):");
  for (const r of rows) console.log(`  ${r.ref_key.padEnd(26)} ${String(r.price_points).padStart(7)} PTS`);
  await pool.end();
}
main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
