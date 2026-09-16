import { randomUUID } from "node:crypto";
import type { WebSocket, WebSocketServer } from "ws";
import { RoomRegistry } from "./roomRegistry.js";
import {
  parseClientMessage,
  type ChatMessage,
  type ServerMessage,
} from "./messages.js";

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

export function registerWsHandlers(wss: WebSocketServer): void {
  const registry = new RoomRegistry();

  wss.on("connection", (socket: WebSocket) => {
    console.log("client connected");

    socket.on("message", (data: Buffer) => {
      const result = parseClientMessage(data.toString());

      if (!result.ok) {
        send(socket, {
          type: "error",
          code: result.code,
          message: result.message,
        });
        return;
      }

      const message = result.message;

      switch (message.type) {
        case "join": {
          registry.join(socket, message.roomId);
          send(socket, { type: "joined", roomId: message.roomId });
          break;
        }
        case "leave": {
          registry.leave(socket, message.roomId);
          break;
        }
        case "send": {
          if (!registry.isMember(socket, message.roomId)) {
            send(socket, {
              type: "error",
              code: "NOT_IN_ROOM",
              message: `You must join "${message.roomId}" before sending to it`,
            });
            return;
          }

          const chatMessage: ChatMessage = {
            id: randomUUID(),
            roomId: message.roomId,
            content: message.content,
            createdAt: new Date().toISOString(),
          };
          const payload: ServerMessage = {
            type: "message_created",
            message: chatMessage,
          };
          registry.broadcast(message.roomId, JSON.stringify(payload));
          break;
        }
      }
    });

    const cleanup = () => {
      registry.leaveAll(socket);
      console.log("client disconnected");
    };

    socket.on("close", cleanup);
    socket.on("error", cleanup);
  });
}
