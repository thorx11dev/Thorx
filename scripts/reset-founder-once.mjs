/**
 * One-off founder password reset (owner-requested).
 * Finds the founder account, prints its email, sets a new bcrypt password.
 * Run: node scripts/reset-founder-once.mjs
 */
import pg from "pg";
import bcrypt from "bcrypt";

const DATABASE_URL = process.env.DATABASE_URL;
const NEW_PASSWORD = process.env.NEW_PASSWORD;

if (!DATABASE_URL || !NEW_PASSWORD) {
  console.error("DATABASE_URL aur NEW_PASSWORD dono chahiye.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    `SELECT id, email, identity, role, totp_enabled FROM users WHERE role = 'founder' LIMIT 5`,
  );
  if (rows.length === 0) {
    console.log("Koi founder account nahi mila.");
    process.exit(1);
  }
  for (const r of rows) {
    console.log(`Founder: email=${r.email} identity=${r.identity} totp_enabled=${r.totp_enabled}`);
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  const upd = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE role = 'founder' RETURNING email`,
    [hash],
  );
  console.log(`✅ Password reset ho gaya for: ${upd.rows.map((r) => r.email).join(", ")}`);
} finally {
  await pool.end();
}
