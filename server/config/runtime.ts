const defaultDevOrigins = [
  "http://localhost:5000",
  "https://localhost:5000",
  "http://127.0.0.1:5000",
  "https://127.0.0.1:5000",
];

const defaultHostedOrigins = [
  "https://thorx.pro",
  "https://www.thorx.pro",
  "https://api.thorx.pro",
  "https://thorx.freebuff.app",
];

function parseCsv(value?: string): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// Replit's preview pane embeds the app in a cross-site iframe (the top-level
// document is on a different site than the app itself). Browsers refuse to
// send SameSite=Lax/Strict cookies on subresource (fetch/XHR) requests in
// that context, so session + CSRF cookies silently stop round-tripping.
// Replit's proxy always terminates HTTPS, so it's always safe to use
// SameSite=None + Secure when running on Replit (dev or prod).
const isReplit = process.env.REPL_ID !== undefined || process.env.REPLIT_DB_URL !== undefined;

export const runtimeConfig = {
  isProd: process.env.NODE_ENV === "production",
  isReplit,
  port: parseInt(process.env.PORT || "5000", 10),
  frontendOrigins: [
    ...defaultDevOrigins,
    ...defaultHostedOrigins,
    ...parseCsv(process.env.FRONTEND_ORIGINS),
    ...(process.env.REPLIT_DEV_DOMAIN ? [
      `https://${process.env.REPLIT_DEV_DOMAIN}`,
      `http://${process.env.REPLIT_DEV_DOMAIN}`,
    ] : []),
    ...(process.env.REPL_SLUG && process.env.REPL_OWNER ? [
      `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`,
      `http://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`,
    ] : []),
  ],
  sessionSecret: process.env.SESSION_SECRET,
  // Explicit env vars always win; otherwise default to cross-site-safe
  // cookies on Replit (or in prod) and same-site cookies for plain local dev.
  sessionCookieSecure: process.env.SESSION_COOKIE_SECURE
    ? process.env.SESSION_COOKIE_SECURE === "true"
    // In test mode, supertest uses plain HTTP — Secure cookies are silently
    // dropped by tough-cookie, breaking session persistence in integration tests.
    : process.env.NODE_ENV === "test"
    ? false
    : (isReplit || process.env.NODE_ENV === "production"),
  sessionCookieDomain: process.env.SESSION_COOKIE_DOMAIN || undefined,
  sessionCookieSameSite: (process.env.SESSION_COOKIE_SAME_SITE || (
    process.env.NODE_ENV === "test" ? "lax" :
    (isReplit || process.env.NODE_ENV === "production") ? "none" : "lax"
  )).toLowerCase() as "lax" | "strict" | "none",
  proxyAllowedHosts: parseCsv(process.env.PROXY_ALLOWED_HOSTS),
};

export function isOriginAllowed(origin: string): boolean {
  if (runtimeConfig.frontendOrigins.includes(origin)) return true;
  // Allow any *.replit.app or *.repl.co domain (Replit deployments and previews)
  if (/^https:\/\/[a-z0-9-]+\.replit\.app$/.test(origin)) return true;
  if (/^https?:\/\/[a-z0-9-]+\.[a-z0-9]+\.repl\.co$/.test(origin)) return true;
  return false;
}
