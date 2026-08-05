import type { Server as HttpServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import type session from "express-session";
import { storage } from "./storage";

/**
 * Lightweight real-time sync layer.
 *
 * Every admin action that mutates a user's financial/profile/rank/status data
 * broadcasts a `user:updated` event to:
 *   1. that specific user's open sessions (any tab/device where they're logged in), and
 *   2. every connected team/admin session that has permission to view user data
 *      (so other team members' CRM views refresh too).
 *
 * Clients react by invalidating their TanStack Query caches — see
 * client/src/hooks/useRealtimeSync.ts.
 */

interface SocketMeta {
  userId: string;
  /** True only for sessions allowed to see cross-user activity (founder/admin, or team with a users/dashboard section grant). */
  canSeeUserActivity: boolean;
  /** Active guild ID for Engine C chat routing (set on join, cleared on leave). */
  guildId?: string;
}

const sockets = new Map<WebSocket, SocketMeta>();

let wss: WebSocketServer | null = null;

/** Mirrors the section-level grants requirePermission() treats as covering VIEW_USERS in server/routes.ts. */
const USER_VISIBILITY_SECTIONS = ["users", "dashboard"];

async function canSeeUserActivity(role: string | undefined, userId: string): Promise<boolean> {
  if (role === "founder" || role === "admin") return true;
  if (role !== "team") return false;
  try {
    const keys = await storage.getTeamKeysByUser(userId);
    const activeKey = keys.find((k) => k.isActive !== false);
    const permissions: string[] = activeKey?.permissions || [];
    return permissions.some((p) => USER_VISIBILITY_SECTIONS.includes(p) || p === "VIEW_USERS" || p === "MANAGE_USERS");
  } catch {
    return false;
  }
}

export function initRealtime(
  httpServer: HttpServer,
  sessionMiddleware: ReturnType<typeof session>
) {
  wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (req: IncomingMessage, socket, head) => {
    if (req.url !== "/ws") return; // let other upgrade handlers (e.g. Vite HMR) proceed
    // Reuse the same express-session middleware to parse the session cookie.
    sessionMiddleware(req as any, {} as any, async () => {
      const sess: any = (req as any).session;
      const userId: string | undefined = sess?.userId;
      if (!userId) {
        socket.destroy();
        return;
      }
      const role: string | undefined = sess?.user?.role;
      const visibility = await canSeeUserActivity(role, userId);
      wss!.handleUpgrade(req, socket, head, (ws) => {
        sockets.set(ws, { userId, canSeeUserActivity: visibility });
        ws.on("close", () => sockets.delete(ws));
        ws.on("error", () => sockets.delete(ws));
        // Handle client-initiated guild registration so broadcastGuildEvent
        // can route guild-scoped events to individual members.
        // Per-socket WS rate limiter: max 10 messages per 10-second window.
        let wsMessageCount = 0;
        let wsRateLimitResetAt = Date.now() + 10_000;

        ws.on("message", async (raw) => {
          // Rate limit enforcement
          const now = Date.now();
          if (now > wsRateLimitResetAt) {
            wsMessageCount = 0;
            wsRateLimitResetAt = now + 10_000;
          }
          wsMessageCount++;
          if (wsMessageCount > 10) {
            ws.close(1008, "Rate limit exceeded");
            return;
          }

          try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === "join_guild" && typeof msg.guildId === "string") {
              // Verify server-side that this user actually belongs to the requested guild
              // before routing them into that guild's real-time channel.
              const socketMeta = sockets.get(ws);
              if (socketMeta?.userId) {
                const user = await storage.getUserById(socketMeta.userId);
                if (user?.guildId === msg.guildId) {
                  setSocketGuild(ws, msg.guildId);
                }
                // Silently ignore unauthorized join_guild attempts
              }
            } else if (msg.type === "leave_guild") {
              setSocketGuild(ws, null);
            }
          } catch {
            // ignore malformed messages
          }
        });
      });
    });
  });
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

/**
 * Notify a specific user's connections and all team/admin connections
 * permitted to see cross-user activity that the user's record changed. Call
 * this after any mutation to a user's balance, rank, status, role, or profile.
 */
export function broadcastUserUpdated(userId: string, reason?: string, data?: Record<string, unknown>) {
  const payload = { type: "user:updated", userId, reason, data, at: Date.now() };
  sockets.forEach((meta, ws) => {
    if (meta.userId === userId || meta.canSeeUserActivity) {
      send(ws, payload);
    }
  });
}

/** Notify all connected sessions permitted to see cross-user activity (e.g. new user registered, directory changed). */
export function broadcastTeamRefresh(reason?: string) {
  const payload = { type: "team:refresh", reason, at: Date.now() };
  sockets.forEach((meta, ws) => {
    if (meta.canSeeUserActivity) send(ws, payload);
  });
}

/**
 * Broadcast a message exclusively to sockets subscribed to a specific guild channel.
 * Security: only clients that passed the server-side membership check (join_guild handler)
 * and were registered via setSocketGuild() will receive this message.
 */
export function broadcastGuildMessage(guildId: string, payload: unknown) {
  if (!wss) return;
  const message = JSON.stringify({ ...(payload as object), guildId });
  sockets.forEach((meta, ws) => {
    if (meta.guildId === guildId && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}

/**
 * Push a real-time risk alert to all admin/founder/authorized team sessions.
 * Only emitted for High and Critical severity cases so the UI badge can pulse.
 */
export function broadcastRiskAlert(data: {
  caseId: string;
  userId: string;
  userName: string;
  riskScore: number;
  severity: string;
  signals: { name: string; score: number; detail: string }[];
}) {
  const payload = { type: "risk:alert", ...data, at: Date.now() };
  sockets.forEach((meta, ws) => {
    if (meta.canSeeUserActivity) send(ws, payload);
  });
}

/**
 * THORX v3 — push a Live Activity Feed event to all admin/founder/authorized
 * team sessions. See server/modules/live-feed.ts (emitFeedEvent), which
 * persists the event to activity_feed and then calls this.
 */
export function broadcastAdminFeedEvent(event: {
  type: string;
  userId?: string;
  guildId?: string;
  displayMessage: string;
  data: Record<string, unknown>;
}) {
  const payload = { type: "feed:event", event, at: Date.now() };
  sockets.forEach((meta, ws) => {
    if (meta.canSeeUserActivity) send(ws, payload);
  });
}

/**
 * Push a guild-scoped event to all sockets whose active guild matches, plus
 * all admin/team sessions permitted to see cross-user activity.
 * Used for Engine C events: weekly_points, pool_credited, nudge, mvp, applications.
 */
export function broadcastGuildEvent(guildId: string, eventType: string, data?: Record<string, unknown>) {
  const payload = { type: eventType, guildId, data, at: Date.now() };
  sockets.forEach((meta, ws) => {
    if (meta.guildId === guildId || meta.canSeeUserActivity) {
      send(ws, payload);
    }
  });
}

/**
 * Push an event directly to a specific user's connected sessions only.
 * Used for user-private notifications: application_decided, nudge_received.
 */
export function broadcastToUser(userId: string, eventType: string, data?: Record<string, unknown>) {
  const payload = { type: eventType, userId, data, at: Date.now() };
  sockets.forEach((meta, ws) => {
    if (meta.userId === userId) send(ws, payload);
  });
}

/**
 * Register (or deregister) the active guild for a WebSocket session so that
 * guild-scoped events are routed correctly. Call from client join/leave messages.
 */
export function setSocketGuild(ws: WebSocket, guildId: string | null) {
  const meta = sockets.get(ws);
  if (!meta) return;
  if (guildId) meta.guildId = guildId;
  else delete meta.guildId;
}

/**
 * 3.2 — Broadcast a leaderboard refresh event to all connected clients so
 * they immediately invalidate their leaderboard query cache without waiting
 * for their own poll interval.
 */
export function broadcastLeaderboardRefreshed() {
  const payload = { type: "leaderboard.refreshed", at: Date.now() };
  sockets.forEach((_meta, ws) => send(ws, payload));
}

/**
 * 3.2 — Broadcast a guild weekly-target change to all sockets in that guild
 * channel plus all admin/team sessions. Called whenever an admin overrides
 * the weeklyTarget field so CaptainPortal picks it up without a page refresh.
 */
export function broadcastGuildTargetUpdated(guildId: string, weeklyTarget: number) {
  const payload = { type: "guild.target_updated", guildId, weeklyTarget, at: Date.now() };
  sockets.forEach((meta, ws) => {
    if (meta.guildId === guildId || meta.canSeeUserActivity) {
      send(ws, payload);
    }
  });
}

/**
 * Close all open WebSocket connections belonging to a specific user.
 * Per Q3 business decision: sends an explicit SUSPENDED message payload
 * BEFORE closing so the client receives clear UX feedback, not just a close code.
 * Called immediately after an account is suspended (Finding 1-F).
 */
export function closeUserSockets(userId: string, code: number, reason: string): void {
  sockets.forEach((meta, ws) => {
    if (meta.userId === userId && ws.readyState === WebSocket.OPEN) {
      // Send the suspension notice first so the client can show a clear message
      // before the connection drops (Q3 business decision).
      try {
        ws.send(JSON.stringify({
          type: "SUSPENDED",
          message: "Your account has been suspended. Please contact support if you believe this is an error.",
        }));
      } catch {
        // If send fails, proceed to close anyway
      }
      ws.close(code, reason);
    }
  });
}
