import type { Server as HttpServer } from "http";
import type session from "express-session";

/**
 * Real-time sync layer — DISABLED on free-tier hosting.
 *
 * Free container hosts (e.g. SnapDeploy's free tier) block WebSocket
 * connections and refuse to deploy apps that depend on the `ws` package,
 * so the `ws` dependency has been removed and every function in this
 * module is a no-op. The app remains fully functional: login, earning,
 * balances, rankings, guilds and admin actions all work over plain REST,
 * and the frontend refetches data on every action and on window focus.
 *
 * The full WebSocket implementation is preserved in git history (the
 * previous version of this file) — restore it when THORX moves to a host
 * that supports WebSockets (SnapDeploy Small/Always-On, Koyeb, Render,
 * Railway, Fly.io), then re-add `ws` to package.json.
 */

export function initRealtime(
  _httpServer: HttpServer,
  _sessionMiddleware: ReturnType<typeof session>,
): void {
  // no-op — WebSocket upgrades are not handled on free-tier hosting.
}

export function broadcastUserUpdated(_userId: string, _reason?: string, _data?: Record<string, unknown>): void {
  // no-op
}

/** Presence is always "offline" — no sockets are tracked on free-tier hosting. */
export function isUserOnline(_userId: string): boolean {
  return false;
}

export function broadcastTeamRefresh(_reason?: string): void {
  // no-op
}

export function broadcastGuildMessage(_guildId: string, _payload: unknown): void {
  // no-op
}

export function broadcastRiskAlert(_data: {
  caseId: string;
  userId: string;
  userName: string;
  riskScore: number;
  severity: string;
  signals: { name: string; score: number; detail: string }[];
}): void {
  // no-op
}

export function broadcastAdminFeedEvent(_event: {
  type: string;
  userId?: string;
  guildId?: string;
  displayMessage: string;
  data: Record<string, unknown>;
}): void {
  // no-op
}

export function broadcastGuildEvent(_guildId: string, _eventType: string, _data?: Record<string, unknown>): void {
  // no-op
}

export function broadcastToUser(_userId: string, _eventType: string, _data?: Record<string, unknown>): void {
  // no-op
}

export function setSocketGuild(_ws: unknown, _guildId: string | null): void {
  // no-op
}

export function broadcastLeaderboardRefreshed(): void {
  // no-op
}

export function broadcastGuildTargetUpdated(_guildId: string, _weeklyTarget: number): void {
  // no-op
}

export function closeUserSockets(_userId: string, _code: number, _reason: string): void {
  // no-op
}
