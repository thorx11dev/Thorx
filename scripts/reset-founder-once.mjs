/**
 * One-off password reset for the founder account (owner-requested).
 * Finds the founder account, prints its email + 2FA status, sets a new bcrypt password.
 *
 * Usage (run from the repo root, with the production DATABASE_URL from Render):
 *   DATABASE_URL="postgres://..." NEW_PASSWORD="YourNewStrongPass123" node scripts/reset-founder-once.mjs
 *
 * Optional: target a specific email instead of every founder account:
 *   EMAIL="thorx11dev@gmail.com" DATABASE_URL="..." NEW_PASSWORD="..." node scripts/reset-founder-once.mjs
 */
import pg from "pg";
import bcrypt from "bcrypt";

const DATABASE_URL = process.env.DATABASE_URL;
const NEW_PASSWORD = process.env.NEW_PASSWORD;
const EMAIL = (process.env.EMAIL ?? "").trim().toLowerCase();

if (!DATABASE_URL || !NEW_PASSWORD) {
  console.error("DATABASE_URL aur NEW_PASSWORD dono chahiye.");
  process.exit(1);
}
if (NEW_PASSWORD.length < 8) {
  console.error("NEW_PASSWORD kam se kam 8 characters ka hona chahiye.");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

try {
  const { rows } = await pool.query(
    `SELECT id, email, identity, role, totp_enabled, is_active FROM users
     WHERE role = 'founder' AND ($1 = '' OR lower(email) = $1) LIMIT 5`,
    [EMAIL],
  );
  if (rows.length === 0) {
    console.log("Koi matching founder account nahi mila.");
    process.exit(1);
  }
  for (const r of rows) {
    console.log(`Founder: email=${r.email} identity=${r.identity} totp_enabled=${r.totp_enabled} is_active=${r.is_active}`);
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  const upd = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now()
     WHERE role = 'founder' AND ($2 = '' OR lower(email) = $2) RETURNING email`,
    [hash, EMAIL],
  );
  console.log(`✅ Password reset ho gaya for: ${upd.rows.map((r) => r.email).join(", ")}`);
  console.log("⚠️  Agar 2FA (totp_enabled=true) on hai, login ke baad authenticator code bhi mangega.");
} finally {
  await pool.end();
}
