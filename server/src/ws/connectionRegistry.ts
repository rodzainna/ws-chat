import type { WebSocket } from "ws";
import type { ServerMessage, SessionExpiredReason } from "./messages.js";

export class ConnectionRegistry {
  private readonly socketsByUserId = new Map<string, Set<WebSocket>>();

  register(userId: string, socket: WebSocket): void {
    let sockets = this.socketsByUserId.get(userId);
    if (!sockets) {
      sockets = new Set();
      this.socketsByUserId.set(userId, sockets);
    }
    sockets.add(socket);
  }

  unregister(userId: string, socket: WebSocket): void {
    const sockets = this.socketsByUserId.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) {
      this.socketsByUserId.delete(userId);
    }
  }

  disconnectUser(userId: string, reason: SessionExpiredReason): boolean {
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
    if (socket.readyState === socket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "session_expired",
          reason,
        } satisfies ServerMessage),
      );
    }
    socket.close(4001, reason);
  }
}
