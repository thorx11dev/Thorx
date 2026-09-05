const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const id = process.argv[2] || "THORX_AI_PIONEER_9722";
pool
  .query("SELECT id, identity, email, user_rank_tier, is_active, created_at FROM users WHERE identity ILIKE $1 LIMIT 5", [id])
  .then((r) => {
    if (r.rows.length === 0) console.log("NO USER FOUND with identity:", id);
    for (const u of r.rows) {
      console.log("identity:", u.identity);
      console.log("id (UUID = CPX ext_user_id):", u.id);
      console.log("rank:", u.user_rank_tier, "| active:", u.is_active, "| created:", u.created_at);
    }
    return pool.end();
  })
  .catch((e) => {
    console.error("ERR:", e.message);
    process.exit(1);
  });
