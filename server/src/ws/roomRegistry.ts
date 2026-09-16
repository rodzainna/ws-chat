import type { WebSocket } from "ws";

export class RoomRegistry {
  private readonly roomsToSockets = new Map<string, Set<WebSocket>>();
  private readonly socketsToRooms = new Map<WebSocket, Set<string>>();

  join(socket: WebSocket, roomId: string): void {
    let sockets = this.roomsToSockets.get(roomId);
    if (!sockets) {
      sockets = new Set();
      this.roomsToSockets.set(roomId, sockets);
    }
    sockets.add(socket);

    let rooms = this.socketsToRooms.get(socket);
    if (!rooms) {
      rooms = new Set();
      this.socketsToRooms.set(socket, rooms);
    }
    rooms.add(roomId);
  }

  leave(socket: WebSocket, roomId: string): void {
    const sockets = this.roomsToSockets.get(roomId);
    if (sockets) {
      sockets.delete(socket);
      if (sockets.size === 0) {
        this.roomsToSockets.delete(roomId);
      }
    }

    const rooms = this.socketsToRooms.get(socket);
    if (rooms) {
      rooms.delete(roomId);
      if (rooms.size === 0) {
        this.socketsToRooms.delete(socket);
      }
    }
  }

  leaveAll(socket: WebSocket): void {
    const rooms = this.socketsToRooms.get(socket);
    if (!rooms) return;

    for (const roomId of rooms) {
      const sockets = this.roomsToSockets.get(roomId);
      if (sockets) {
        sockets.delete(socket);
        if (sockets.size === 0) {
          this.roomsToSockets.delete(roomId);
        }
      }
    }

    this.socketsToRooms.delete(socket);
  }

  isMember(socket: WebSocket, roomId: string): boolean {
    return this.socketsToRooms.get(socket)?.has(roomId) ?? false;
  }

  broadcast(roomId: string, data: string): void {
    const sockets = this.roomsToSockets.get(roomId);
    if (!sockets) return;

    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
      }
    }
  }
}
