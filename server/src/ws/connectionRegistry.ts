import type { WebSocket } from "ws";
import { sendServerMessage, type SessionExpiredReason } from "./messages.js";

const RECENT_DISCONNECT_GRACE_MS = 5000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export class ConnectionRegistry {
  private readonly socketsByUserId = new Map<string, Set<WebSocket>>();
  private readonly sessionBySocket = new WeakMap<WebSocket, string>();

  // a handshake can pass its checks just before a deactivation or logout, then
  // register after the disconnect already ran; this catches it on register.
  // Keyed by userId or sessionId (both uuids).
  private readonly recentDisconnects = new Map<
    string,
    { reason: SessionExpiredReason; expiresAt: number }
  >();

  constructor() {
    setInterval(() => {
      this.sweepExpiredDisconnects(Date.now());
    }, SWEEP_INTERVAL_MS).unref();
  }

  register(userId: string, sessionId: string, socket: WebSocket): boolean {
    const recent =
      this.recentDisconnects.get(userId) ??
      this.recentDisconnects.get(sessionId);
    if (recent && recent.expiresAt > Date.now()) {
      this.disconnectSocket(socket, recent.reason);
      return false;
    }

    this.sessionBySocket.set(socket, sessionId);
    let sockets = this.socketsByUserId.get(userId);
    const wasOffline = !sockets || sockets.size === 0;
    if (!sockets) {
      sockets = new Set();
      this.socketsByUserId.set(userId, sockets);
    }
    sockets.add(socket);
    return wasOffline;
  }

  unregister(userId: string, socket: WebSocket): boolean {
    const sockets = this.socketsByUserId.get(userId);
    if (!sockets) return false;
    sockets.delete(socket);
    const wentOffline = sockets.size === 0;
    if (wentOffline) {
      this.socketsByUserId.delete(userId);
    }
    return wentOffline;
  }

  isOnline(userId: string): boolean {
    return (this.socketsByUserId.get(userId)?.size ?? 0) > 0;
  }

  getSockets(userId: string): WebSocket[] {
    return [...(this.socketsByUserId.get(userId) ?? [])];
  }

  disconnectUser(userId: string, reason: SessionExpiredReason): boolean {
    this.recentDisconnects.set(userId, {
      reason,
      expiresAt: Date.now() + RECENT_DISCONNECT_GRACE_MS,
    });

    const sockets = this.socketsByUserId.get(userId);
    if (!sockets || sockets.size === 0) return false;
    for (const socket of sockets) {
      this.disconnectSocket(socket, reason);
    }
    return true;
  }

  // every tab of one browser shares a session; other devices are untouched
  disconnectSession(
    userId: string,
    sessionId: string,
    reason: SessionExpiredReason,
  ): void {
    this.recentDisconnects.set(sessionId, {
      reason,
      expiresAt: Date.now() + RECENT_DISCONNECT_GRACE_MS,
    });

    for (const socket of this.socketsByUserId.get(userId) ?? []) {
      if (this.sessionBySocket.get(socket) === sessionId) {
        this.disconnectSocket(socket, reason);
      }
    }
  }

  private disconnectSocket(
    socket: WebSocket,
    reason: SessionExpiredReason,
  ): void {
    sendServerMessage(socket, { type: "session_expired", reason });
    socket.close(4001, reason);
  }

  private sweepExpiredDisconnects(now: number): void {
    for (const [id, entry] of this.recentDisconnects) {
      if (entry.expiresAt <= now) {
        this.recentDisconnects.delete(id);
      }
    }
  }
}
