import type { WebSocket } from "ws";
import { sendServerMessage, type SessionExpiredReason } from "./messages.js";

const RECENT_DISCONNECT_GRACE_MS = 5000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

type RecentDisconnect = { reason: SessionExpiredReason; expiresAt: number };

export class ConnectionRegistry {
  private readonly socketsByUserId = new Map<string, Set<WebSocket>>();
  private readonly socketsBySessionId = new Map<string, Set<WebSocket>>();
  private readonly sessionBySocket = new WeakMap<WebSocket, string>();

  // a handshake can pass its checks just before a deactivation or logout, then
  // register after the disconnect already ran; this catches it on register
  private readonly recentUserDisconnects = new Map<string, RecentDisconnect>();
  private readonly recentSessionDisconnects = new Map<
    string,
    RecentDisconnect
  >();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      sweep(this.recentUserDisconnects, now);
      sweep(this.recentSessionDisconnects, now);
    }, SWEEP_INTERVAL_MS).unref();
  }

  // sessionId is null for access tokens issued before sessions existed
  register(
    userId: string,
    sessionId: string | null,
    socket: WebSocket,
  ): boolean {
    const recent =
      active(this.recentUserDisconnects.get(userId)) ??
      (sessionId ? active(this.recentSessionDisconnects.get(sessionId)) : null);
    if (recent) {
      this.disconnectSocket(socket, recent.reason);
      return false;
    }

    if (sessionId) {
      this.sessionBySocket.set(socket, sessionId);
      addTo(this.socketsBySessionId, sessionId, socket);
    }
    const wasOffline = !this.isOnline(userId);
    addTo(this.socketsByUserId, userId, socket);
    return wasOffline;
  }

  unregister(userId: string, socket: WebSocket): boolean {
    const sessionId = this.sessionBySocket.get(socket);
    if (sessionId) removeFrom(this.socketsBySessionId, sessionId, socket);
    return removeFrom(this.socketsByUserId, userId, socket);
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUserId.get(userId)?.size ?? 0) > 0;
  }

  getSockets(userId: string): WebSocket[] {
    return [...(this.socketsByUserId.get(userId) ?? [])];
  }

  disconnectUser(userId: string, reason: SessionExpiredReason): boolean {
    this.recentUserDisconnects.set(userId, {
      reason,
      expiresAt: Date.now() + RECENT_DISCONNECT_GRACE_MS,
    });
    return this.disconnectAll(this.socketsByUserId.get(userId), reason);
  }

  // every tab of one browser shares a session; other devices are untouched
  disconnectSession(sessionId: string, reason: SessionExpiredReason): boolean {
    this.recentSessionDisconnects.set(sessionId, {
      reason,
      expiresAt: Date.now() + RECENT_DISCONNECT_GRACE_MS,
    });
    return this.disconnectAll(this.socketsBySessionId.get(sessionId), reason);
  }

  private disconnectAll(
    sockets: Set<WebSocket> | undefined,
    reason: SessionExpiredReason,
  ): boolean {
    if (!sockets || sockets.size === 0) return false;
    for (const socket of sockets) {
      this.disconnectSocket(socket, reason);
    }
    return true;
  }

  private disconnectSocket(
    socket: WebSocket,
    reason: SessionExpiredReason,
  ): void {
    sendServerMessage(socket, { type: "session_expired", reason });
    socket.close(4001, reason);
  }
}

function active(entry: RecentDisconnect | undefined): RecentDisconnect | null {
  return entry && entry.expiresAt > Date.now() ? entry : null;
}

function addTo(
  map: Map<string, Set<WebSocket>>,
  key: string,
  socket: WebSocket,
) {
  let sockets = map.get(key);
  if (!sockets) {
    sockets = new Set();
    map.set(key, sockets);
  }
  sockets.add(socket);
}

// returns true when the key has no sockets left
function removeFrom(
  map: Map<string, Set<WebSocket>>,
  key: string,
  socket: WebSocket,
): boolean {
  const sockets = map.get(key);
  if (!sockets) return false;
  sockets.delete(socket);
  if (sockets.size > 0) return false;
  map.delete(key);
  return true;
}

function sweep(map: Map<string, RecentDisconnect>, now: number): void {
  for (const [key, entry] of map) {
    if (entry.expiresAt <= now) map.delete(key);
  }
}
