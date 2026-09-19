import type { WebSocket } from "ws";
import { sendServerMessage, type SessionExpiredReason } from "./messages.js";

const RECENT_DISCONNECT_GRACE_MS = 5000;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export class ConnectionRegistry {
  private readonly socketsByUserId = new Map<string, Set<WebSocket>>();

  // a handshake can pass its isActive check just before a deactivation, then
  // register after disconnectUser() already ran; this catches it on register
  private readonly recentlyDisconnectedUserIds = new Map<
    string,
    { reason: SessionExpiredReason; expiresAt: number }
  >();

  constructor() {
    setInterval(() => {
      this.sweepExpiredDisconnects(Date.now());
    }, SWEEP_INTERVAL_MS).unref();
  }

  register(userId: string, socket: WebSocket): boolean {
    const recent = this.recentlyDisconnectedUserIds.get(userId);
    if (recent && recent.expiresAt > Date.now()) {
      this.disconnectSocket(socket, recent.reason);
      return false;
    }

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
    this.recentlyDisconnectedUserIds.set(userId, {
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

  private disconnectSocket(
    socket: WebSocket,
    reason: SessionExpiredReason,
  ): void {
    sendServerMessage(socket, { type: "session_expired", reason });
    socket.close(4001, reason);
  }

  private sweepExpiredDisconnects(now: number): void {
    for (const [userId, entry] of this.recentlyDisconnectedUserIds) {
      if (entry.expiresAt <= now) {
        this.recentlyDisconnectedUserIds.delete(userId);
      }
    }
  }
}
