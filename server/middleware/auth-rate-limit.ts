import rateLimit from "express-rate-limit";
import type { Request } from "express";

// Shared skip helper: bypass rate limiting for localhost in development.
const skipLocalhost = (req: Request) => {
  if (process.env.NODE_ENV !== 'production') {
    const ip = req.ip || req.socket?.remoteAddress || '';
    console.log('[TEMP-DEBUG skipLocalhost]', { NODE_ENV: process.env.NODE_ENV, ip, xff: req.headers['x-forwarded-for'], path: req.path });
    if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
  }
  return false;
};

// Shared IP-based key generator (used for auth / withdrawal limiters).
const ipKeyGenerator = (req: Request): string => {
  const forwardedFor = req.headers['x-forwarded-for'];
  const clientIp = typeof forwardedFor === 'string' ? forwardedFor.split(',')[0].trim() : (req as any).ip;
  return clientIp || 'unknown-ip';
};

/**
 * Rate limiter for authentication endpoints (login, register, forgot-password).
 * 10 attempts per IP per 15 minute window.
 *
 * Uses the default keyGenerator (req.ip with IPv6 normalization).
 * trust proxy is already configured at the Express app level.
 */
/**
 * Rate limiter for public API endpoints (landing page stats, etc.).
 * 30 requests per minute per IP — generous enough for real users,
 * restrictive enough to block scrapers.
 */
export const publicApiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: ipKeyGenerator,
  validate: false,
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Try again in 15 minutes.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: ipKeyGenerator,
  validate: false,
});

/**
 * Rate limiter for withdrawal submission endpoints.
 * More lenient than authRateLimiter — legitimate users submit a payout
 * at most a handful of times before a pending-withdrawal check blocks them.
 * 5 requests per IP per 15 minute window.
 *
 * High severity finding of the 2026-07-15 production-readiness audit:
 * withdrawal creation and referral withdrawal were unprotected, allowing
 * an automated/compromised session to hammer the endpoint.
 */
export const withdrawalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many withdrawal requests. Try again in 15 minutes.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: ipKeyGenerator,
  validate: false,
});

/**
 * Rate limiter for profile/rank/general operations.
 * 30 requests per IP per 15 minute window (lenient).
 */
export const profileRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Try again in 15 minutes.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: ipKeyGenerator,
  validate: false,
});

// ─── Earn-route rate limiter ──────────────────────────────────────────────────
/**
 * Rate limiter for earning endpoints (ad-view, task click, task verify).
 * 15 attempts per user per minute — keyed by userId (not IP) so that
 * shared-IP environments (mobile NAT, office proxies) are not unfairly blocked.
 * Falls back to IP if the session cookie has not been set yet (pre-auth hit).
 */
export const earnRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many earn attempts. Try again in a minute.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: (req: Request) => {
    const userId = (req.session as any)?.userId;
    if (userId) return `earn:${userId}`;
    return `earn-ip:${ipKeyGenerator(req)}`;
  },
  validate: false,
});

// ─── Guild interaction rate limiter ──────────────────────────────────────────
/**
 * Rate limiter for guild interaction endpoints (apply, group chat, captain DM).
 * 20 requests per user per minute.
 */
export const guildInteractionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many guild interactions. Slow down and try again.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: (req: Request) => {
    const userId = (req.session as any)?.userId;
    if (userId) return `guild:${userId}`;
    return `guild-ip:${ipKeyGenerator(req)}`;
  },
  validate: false,
});

// ─── Contact form rate limiter ────────────────────────────────────────────────
/**
 * Rate limiter for the public contact form endpoint.
 * 5 submissions per IP per 15 minutes — prevents bot spam that would
 * fill team_emails with millions of rows (audit finding M).
 */
export const contactRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many contact messages. Please try again later.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: ipKeyGenerator,
  validate: false,
});

// ─── Admin user action rate limiter ──────────────────────────────────────────
/**
 * Rate limiter for the /api/admin/users/:id/action endpoint.
 * 30 requests per admin session per 15 minutes — allows burst corrections
 * but prevents automated mass-action abuse (audit finding C2-02).
 * Keyed by userId so different admins share separate quotas.
 */
export const adminActionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many admin actions. Try again in 15 minutes.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: (req: Request) => {
    const userId = (req.session as any)?.userId;
    if (userId) return `admin-action:${userId}`;
    return `admin-action-ip:${ipKeyGenerator(req)}`;
  },
  validate: false,
});

/**
 * Rate limiter for bulk admin actions (e.g. /api/admin/withdrawals/bulk).
 * A single bulk request can mutate many rows at once, so this must be
 * tighter than adminActionRateLimiter (single-item admin actions), not
 * looser — 10 requests per admin session per 15 minutes. Keyed by userId
 * like adminActionRateLimiter, not by IP: the withdrawal-submission
 * limiter it replaced here was IP-keyed, which is the wrong dimension for
 * an authenticated admin action (Payout Operations audit finding).
 */
export const adminBulkActionRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many bulk admin actions. Try again in 15 minutes.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: (req: Request) => {
    const userId = (req.session as any)?.userId;
    if (userId) return `admin-bulk-action:${userId}`;
    return `admin-bulk-action-ip:${ipKeyGenerator(req)}`;
  },
  validate: false,
});

// ─── Bootstrap rate limiter ───────────────────────────────────────────────────
/**
 * Rate limiter for /api/bootstrap-founder.
 * 3 attempts per IP per hour — the endpoint is idempotent but must not be
 * hammerable (audit finding C1-03 / C2-02).
 */
export const bootstrapRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many bootstrap attempts.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: ipKeyGenerator,
  validate: false,
});

// ─── Chatbot rate limiter ─────────────────────────────────────────────────────
/**
 * Rate limiter for the AI chatbot endpoint.
 * 20 messages per IP per minute — prevents DB-read amplification from
 * anonymous bots hammering the endpoint (audit finding N).
 */
export const chatbotRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many messages. Please slow down.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: ipKeyGenerator,
  validate: false,
});

// ─── Contact form per-email rate limiter ──────────────────────────────────────
/**
 * Secondary rate limiter for the public contact form, keyed by submitted email.
 * 3 submissions per email per hour — the IP-based contactRateLimiter is still
 * applied first; this adds a per-sender layer so rotating-IP proxies cannot
 * spam a single email address into the team inbox (audit finding E-08).
 */
export const contactEmailRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many contact attempts from this email. Please try again later.", error: "RATE_LIMITED" },
  skip: skipLocalhost,
  keyGenerator: (req: Request) => {
    const email = (req.body?.email ?? "").toLowerCase().trim();
    return email ? `contact-email:${email}` : `contact-ip-fallback:${ipKeyGenerator(req)}`;
  },
  validate: false,
});
