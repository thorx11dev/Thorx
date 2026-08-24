import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (time-based one-time password) — minimal, dependency-free.
 * Defaults match Google Authenticator / Authy expectations:
 *   HMAC-SHA1, 30-second step, 6 digits, T0 = 0 (Unix epoch).
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 encode (no padding — authenticators accept unpadded keys). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** RFC 4648 base32 decode (tolerates padding, spaces and case). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("Invalid base32 character");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Cryptographically random 20-byte secret (160-bit, per RFC 4226 recommendation). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** Hotp value for one time-step counter (RFC 4226 dynamic truncation). */
function hotp(secretKey: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const digest = createHmac("sha1", secretKey).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

/** Current 6-digit TOTP for a base32 secret at a given epoch-ms timestamp. */
export function totpNow(base32Secret: string, atMs: number = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / 30);
  return hotp(base32Decode(base32Secret), counter);
}

/**
 * Verify a user-supplied code against the current window ±`window` steps
 * (clock drift tolerance). Constant-time comparison.
 */
export function verifyTotp(base32Secret: string, code: string, window = 1, atMs: number = Date.now()): boolean {
  const normalized = (code ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const secretKey = base32Decode(base32Secret);
  const currentStep = Math.floor(atMs / 1000 / 30);
  const expected = Buffer.from(normalized, "utf8");
  for (let drift = -window; drift <= window; drift++) {
    const candidate = Buffer.from(hotp(secretKey, currentStep + drift), "utf8");
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return true;
    }
  }
  return false;
}

/** otpauth:// provisioning URI for authenticator manual entry / QR rendering. */
export function buildOtpauthUri(base32Secret: string, accountLabel: string, issuer = "THORX"): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`);
  const params = new URLSearchParams({
    secret: base32Secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
