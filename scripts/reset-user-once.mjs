/**
 * One-off password reset for a specific account (owner-requested).
 * Run: node scripts/reset-user-once.mjs
 */
import pg from "pg";
import bcrypt from "bcrypt";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const EMAIL = "thorx1111dev@gmail.com";
const NEW_PASSWORD = process.env.NEW_PASSWORD;

try {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  const upd = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE email = $2
     RETURNING email, identity, role, totp_enabled, user_rank_tier, guild_id`,
    [hash, EMAIL],
  );
  if (upd.rows.length === 0) {
    console.log("❌ Account nahi mila:", EMAIL);
  } else {
    const r = upd.rows[0];
    console.log(`✅ Reset OK: ${r.email} | identity=${r.identity} | role=${r.role} | rank=${r.user_rank_tier} | guild=${r.guild_id} | 2FA=${r.totp_enabled}`);
  }
} finally {
  await pool.end();
}
