/**
 * Real-time sync — DISABLED on free-tier hosting.
 *
 * The server no longer accepts WebSocket connections (see server/realtime.ts)
 * because free container hosts block them, so this hook is a no-op. It returns
 * `wsConnected: true` to keep the WsStatusBanner hidden: real-time push is
 * simply unavailable, and every screen refetches its own data over REST on
 * each action and window focus instead.
 *
 * Restore the full WebSocket implementation from git history when THORX is
 * hosted on a platform that supports WebSockets.
 */
export function useRealtimeSync(_user?: unknown, _guildId?: unknown): { wsConnected: boolean } {
  return { wsConnected: true };
}
