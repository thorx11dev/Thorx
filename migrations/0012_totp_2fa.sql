-- 0012: TOTP two-factor auth columns on users
-- Secrets stored AES-256-GCM encrypted (server/utils/credential-crypto.ts).
-- totp_pending_secret holds an unconfirmed enrollment; promoted to
-- totp_secret + totp_enabled only after one live code is verified.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_pending_secret" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "totp_enabled" boolean NOT NULL DEFAULT false;
