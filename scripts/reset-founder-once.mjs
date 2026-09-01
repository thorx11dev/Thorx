/**
 * Password reset by email (owner-requested).
 *
 * Usage (from the repo root, with the production DATABASE_URL):
 *   EMAIL="thorx1111dev@gmail.com" NEW_PASSWORD="Aonimran777!" DATABASE_URL="postgres://..." node scripts/reset-founder-once.mjs
 *
 * If EMAIL is omitted, resets EVERY founder-role account.
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
  // Look up by email first (any role); fall back to founder accounts when no email given.
  const { rows: found } = await pool.query(
    `SELECT id, email, identity, role, totp_enabled, is_active FROM users
     WHERE ($1 <> '' AND lower(email) = $1)
        OR ($1 = '' AND role = 'founder') LIMIT 10`,
    [EMAIL],
  );
  if (found.length === 0) {
    console.log("Koi matching account nahi mila. Email theek hai? (case-insensitive lookup)");
    process.exit(1);
  }
  for (const r of found) {
    console.log(`Account: email=${r.email} role=${r.role} identity=${r.identity} totp_enabled=${r.totp_enabled} is_active=${r.is_active}`);
  }

  const hash = await bcrypt.hash(NEW_PASSWORD, 10);
  const { rows: upd } = await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now()
     WHERE ($2 <> '' AND lower(email) = $2) OR ($2 = '' AND role = 'founder')
     RETURNING email`,
    [hash, EMAIL],
  );
  console.log(`✅ Password reset ho gaya for: ${upd.map((r) => r.email).join(", ")}`);
  console.log("⚠️  Agar account par 2FA (totp_enabled=true) on hai, login ke baad authenticator code bhi mangega.");
  console.log("ℹ️  Ab naye password se login karein — purani sessions bhi logout ho sakti hain.");
} finally {
  await pool.end();
}
