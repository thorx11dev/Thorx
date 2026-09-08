const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DDL = `
CREATE TABLE IF NOT EXISTS "store_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "item_type" text NOT NULL,
  "ref_key" text NOT NULL,
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "category" text NOT NULL DEFAULT 'general',
  "price_points" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft',
  "featured" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 100,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_store_items_ref_key" UNIQUE ("ref_key")
);
CREATE INDEX IF NOT EXISTS "store_items_type_status_idx" ON "store_items" ("item_type", "status");
CREATE TABLE IF NOT EXISTS "user_store_items" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_id" varchar NOT NULL REFERENCES "store_items"("id") ON DELETE CASCADE,
  "purchased_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_user_store_items" UNIQUE ("user_id", "item_id")
);
CREATE INDEX IF NOT EXISTS "user_store_items_user_idx" ON "user_store_items" ("user_id");
CREATE TABLE IF NOT EXISTS "user_customization" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "active_theme_item_id" varchar REFERENCES "store_items"("id") ON DELETE SET NULL,
  "active_components_json" jsonb NOT NULL DEFAULT '{}',
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "store_transactions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_id" varchar NOT NULL REFERENCES "store_items"("id") ON DELETE RESTRICT,
  "price_points" integer NOT NULL,
  "idempotency_key" varchar(64),
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "uniq_store_transactions_idem" UNIQUE ("user_id", "idempotency_key")
);
CREATE INDEX IF NOT EXISTS "store_transactions_user_idx" ON "store_transactions" ("user_id", "created_at");
`;

const SEED = `
INSERT INTO store_items (item_type, ref_key, title, description, category, price_points, status, featured, sort_order)
VALUES
  ('theme', 'theme_midnight', 'Midnight Foundry', 'A premium dark environment: near-black blue steel surfaces, glowing cobalt accents and floating depth. Built for night owls and long sessions.', 'dark', 25000, 'published', true, 10),
  ('theme', 'theme_nordic', 'Nordic Frost', 'A quiet, airy light system: warm paper surfaces, ink typography, hairline borders and a grounded sage accent. Max focus, zero noise.', 'light', 40000, 'published', false, 20),
  ('theme', 'theme_ember', 'Ember Editorial', 'An editorial design language: cream paper, high-contrast ink, razor-sharp corners and a burning ember accent. Typography leads, everything else follows.', 'editorial', 60000, 'published', false, 30),
  ('theme', 'theme_velvet', 'Velvet Luxe', 'A rich, luxurious environment: plum-graphite surfaces, warm gold accents and jewel-toned depth. Your Thorx, dressed for the evening.', 'premium', 100000, 'published', true, 40),
  ('component', 'dashboard_cards_minimal', 'Quiet Glass', 'Minimal SaaS cards: no borders, whisper-soft elevation and generous breathing room. The calmest way to read your numbers.', 'dashboard_cards', 20000, 'published', false, 10),
  ('component', 'dashboard_cards_editorial', 'Editorial Ledger', 'Magazine-style stat cards: huge tabular numerals, mono micro-labels and hairline rules. Quiet confidence, print-grade rhythm.', 'dashboard_cards', 30000, 'published', false, 20),
  ('component', 'dashboard_cards_brutal', 'Neo Brutal', 'Experimental brutalist cards: heavy 3px ink borders, hard offset shadows and zero softness. Loud, confident, unmissable.', 'dashboard_cards', 50000, 'published', true, 30)
ON CONFLICT (ref_key) DO NOTHING;
`;

async function main() {
  await pool.query(DDL);
  console.log("DDL applied (4 tables + indexes)");
  await pool.query(SEED);
  const { rows } = await pool.query("SELECT ref_key, title, price_points, status FROM store_items ORDER BY sort_order");
  for (const r of rows) console.log(`  ${r.ref_key.padEnd(30)} ${String(r.price_points).padStart(7)} PTS  ${r.status}`);

  // Test TX-Points for the payout/store test account (admin-granted test credit)
  const upd = await pool.query(
    "UPDATE users SET tx_points_balance = tx_points_balance + 500000 WHERE email = $1 RETURNING identity, tx_points_balance",
    ["thorx1111dev@gmail.com"]
  );
  if (upd.rows[0]) console.log("test TX-Points credit →", upd.rows[0].identity, "=", upd.rows[0].tx_points_balance);
  await pool.end();
}

main().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
