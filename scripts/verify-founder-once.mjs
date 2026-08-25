/**
 * Verify founder login credentials directly against DB (debug).
 * Run: node scripts/verify-founder-once.mjs
 */
import pg from "pg";
import bcrypt from "bcrypt";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    `SELECT id, email, identity, role, is_active, left(password_hash, 7) AS hash_prefix, length(password_hash) AS hash_len
     FROM users WHERE email = $1`,
    ["thorx11dev@gmail.com"],
  );
  if (rows.length === 0) {
    console.log("❌ thorx11dev@gmail.com DB mein NAHI mila!");
  } else {
    const u = rows[0];
    console.log(`User mila: role=${u.role} is_active=${u.is_active} hash=${u.hash_prefix}... len=${u.hash_len}`);

    const { rows: hashRows } = await pool.query(
      `SELECT password_hash FROM users WHERE email = $1`,
      ["thorx11dev@gmail.com"],
    );
    const ok = await bcrypt.compare(process.env.TEST_PASSWORD || "Thorx@Founder2026!", hashRows[0].password_hash);
    console.log(`bcrypt.compare("Thorx@Founder2026!") = ${ok ? "✅ MATCH" : "❌ NO MATCH"}`);
  }
} finally {
  await pool.end();
}
