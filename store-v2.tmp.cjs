const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const NEW_KEYS = ["theme_blueprint", "theme_pitch", "theme_stage", "theme_scrapbook", "theme_terminal", "dashboard_cards_serif", "dashboard_cards_mono", "dashboard_cards_sticker"];

async function main() {
  // 1 — Archive old-generation items (ownership rows kept; users who bought
  //     them keep their purchase history; they just disappear from the store).
  const old = await pool.query(
    `UPDATE store_items SET status = 'archived', updated_at = now()
     WHERE ref_key IN ('theme_midnight','theme_nordic','theme_ember','theme_velvet','dashboard_cards_editorial','dashboard_cards_brutal','dashboard_cards_minimal')
     RETURNING ref_key`
  );
  console.log("archived:", old.rows.map(r => r.ref_key).join(", ") || "none");

  // 2 — Deactivate any archived theme still marked active on a user (owned
  //     users keep ownership but a dead theme must not stick to their portal).
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
  console.log("archived activations cleared");

  // 3 — Seed the new reference-grade catalog (published, ready to sell).
  const seed = `
  INSERT INTO store_items (item_type, ref_key, title, description, category, price_points, status, featured, sort_order)
  VALUES
    ('theme', 'theme_blueprint', 'Blueprint', 'An architect''s canvas: warm technical paper with a faint drafting grid, hairline rules, blueprint-blue signals and near-sharp precision corners. Thorx as a studio instrument.', 'light', 30000, 'published', true, 10),
    ('theme', 'theme_pitch', 'Pitch Black', 'Pure brutalist energy: pitch-black surfaces, razor-sharp edges, oversized type presence and a single acid-lime signal carrying every highlight. For users who like it loud.', 'dark', 50000, 'published', true, 20),
    ('theme', 'theme_stage', 'Stage Light', 'A monochrome editorial stage: gallery white, ink-black serif display type, hairline frames and zero-radius gallery framing. Headline-grade typography everywhere.', 'editorial', 60000, 'published', false, 30),
    ('theme', 'theme_scrapbook', 'Sticker Album', 'A playful scrapbook world: warm cream pages, deep-plum sticker outlines, bubblegum-pink signals and chunky soft cards. Your Thorx, with the personality turned all the way up.', 'playful', 40000, 'published', false, 40),
    ('theme', 'theme_terminal', 'Quiet Terminal', 'A focused lab environment: neutral near-black surfaces, monospace display type, data-dense calm and a restrained cyan signal. Built for long, deep work sessions.', 'dark', 75000, 'published', false, 50),
    ('component', 'dashboard_cards_serif', 'Serif Ledger', 'Print-grade stat columns: card chrome removed, a strong hairline rule on top, mono micro-labels and oversized serif numerals. Your numbers read like a magazine spread.', 'dashboard_cards', 35000, 'published', false, 10),
    ('component', 'dashboard_cards_mono', 'Terminal Row', 'Instrument-panel stat rows: monospace numerals, a left data-rule instead of a full frame and tight uppercase labels. Reads like a lab readout, stays perfectly calm.', 'dashboard_cards', 25000, 'published', false, 20),
    ('component', 'dashboard_cards_sticker', 'Sticker Pop', 'Scrapbook-stat stickers: thick ink outlines, extra-soft corners and a candy offset shadow that lifts each card off the page. Playful without ever getting in the way.', 'dashboard_cards', 45000, 'published', false, 30)
  ON CONFLICT (ref_key) DO NOTHING;`;
  await pool.query(seed);

  const { rows } = await pool.query(
    `SELECT ref_key, title, price_points, status FROM store_items ORDER BY item_type, sort_order`
  );
  console.log("\ncatalog now:");
  for (const r of rows) console.log(`  ${r.ref_key.padEnd(26)} ${String(r.price_points).padStart(7)} PTS  ${r.status}`);
  await pool.end();
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
