import type { IncomingMessage } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";
import { RoomRegistry } from "./roomRegistry.js";
import type { AuthenticatedRequest, AuthenticatedWebSocket } from "./types.js";
import {
  parseClientMessage,
  type ChatMessage,
  type ClientMessage,
  type ServerMessage,
} from "./messages.js";
import { canAccessRoom, findRoomMembersByUsernames } from "../db/rooms.js";
import {
  createMessage,
  findMessageById,
  editMessage,
  softDeleteMessage,
  type MessageWithAuthor,
} from "../db/messages.js";
import { validateMessageContent } from "../messages/validation.js";
import { extractMentionedUsernames } from "../messages/mentions.js";
import type { Message } from "../generated/prisma/client.js";

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}

function toChatMessage(message: MessageWithAuthor): ChatMessage {
  return {
    id: message.id,
    roomId: message.roomId,
    userId: message.userId,
    username: message.user.username,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    mentionedUsernames: message.mentions.map((m) => m.user.username),
  };
}

function requireRoomMembership(
  socket: WebSocket,
  registry: RoomRegistry,
  roomId: string,
  verb: string,
): boolean {
  if (registry.isMember(socket, roomId)) return true;
  send(socket, {
    type: "error",
    code: "NOT_IN_ROOM",
    message: `You must join this room before ${verb} it`,
  });
  return false;
}

async function loadOwnedLiveMessage(
  socket: WebSocket,
  userId: string,
  roomId: string,
  messageId: string,
): Promise<Message | null> {
  const existing = await findMessageById(messageId);
  if (!existing || existing.roomId !== roomId || existing.deletedAt !== null) {
    send(socket, {
      type: "error",
      code: "NOT_FOUND",
      message: "Message not found",
    });
    return null;
  }
  if (existing.userId !== userId) {
    send(socket, {
      type: "error",
      code: "FORBIDDEN",
      message: "You can only modify your own messages",
    });
    return null;
  }
  return existing;
}

async function handleMessage(
  socket: AuthenticatedWebSocket,
  registry: RoomRegistry,
  raw: string,
): Promise<void> {
  const result = parseClientMessage(raw);
  if (!result.ok) {
    send(socket, { type: "error", code: result.code, message: result.message });
    return;
  }

  const message: ClientMessage = result.message;
  const userId = socket.userId;

  switch (message.type) {
    case "join": {
      const allowed = await canAccessRoom(userId, message.roomId);
      if (!allowed) {
        send(socket, {
          type: "error",
          code: "FORBIDDEN",
          message: "You are not a member of this room",
        });
        return;
      }
      registry.join(socket, message.roomId);
      send(socket, { type: "joined", roomId: message.roomId });
      return;
    }

    case "leave": {
      registry.leave(socket, message.roomId);
      return;
    }

    case "send": {
      if (
        !requireRoomMembership(socket, registry, message.roomId, "sending to")
      ) {
        return;
      }

      const contentError = validateMessageContent(message.content);
      if (contentError) {
        send(socket, {
          type: "error",
          code: "INVALID_CONTENT",
          message: contentError.message,
        });
        return;
      }

      const trimmedContent = message.content.trim();
      const candidateUsernames = extractMentionedUsernames(trimmedContent);
      const mentionedUsers =
        candidateUsernames.length > 0
          ? await findRoomMembersByUsernames(message.roomId, candidateUsernames)
          : [];

      const created = await createMessage({
        roomId: message.roomId,
        userId,
        content: trimmedContent,
        mentionedUserIds: mentionedUsers.map((u) => u.id),
      });
      registry.broadcast(
        message.roomId,
        JSON.stringify({
          type: "message_created",
          message: toChatMessage(created),
        } satisfies ServerMessage),
      );
      return;
    }

    case "edit": {
      if (
        !requireRoomMembership(socket, registry, message.roomId, "editing in")
      ) {
        return;
      }

      const contentError = validateMessageContent(message.content);
      if (contentError) {
        send(socket, {
          type: "error",
          code: "INVALID_CONTENT",
          message: contentError.message,
        });
        return;
      }

      const existing = await loadOwnedLiveMessage(
        socket,
        userId,
        message.roomId,
        message.messageId,
      );
      if (!existing) return;

      const updated = await editMessage(
        message.messageId,
        message.content.trim(),
      );
      if (!updated) {
        send(socket, {
          type: "error",
          code: "NOT_FOUND",
          message: "Message not found",
        });
        return;
      }
      registry.broadcast(
        message.roomId,
        JSON.stringify({
          type: "message_edited",
          messageId: updated.id,
          content: updated.content,
          editedAt: updated.editedAt!.toISOString(),
        } satisfies ServerMessage),
      );
      return;
    }

    case "delete": {
      if (
        !requireRoomMembership(socket, registry, message.roomId, "deleting in")
      ) {
        return;
      }

      const existing = await loadOwnedLiveMessage(
        socket,
        userId,
        message.roomId,
        message.messageId,
      );
      if (!existing) return;

      const deleted = await softDeleteMessage(message.messageId);
      if (!deleted) {
        send(socket, {
          type: "error",
          code: "NOT_FOUND",
          message: "Message not found",
        });
        return;
      }
      registry.broadcast(
        message.roomId,
        JSON.stringify({
          type: "message_deleted",
          messageId: message.messageId,
        } satisfies ServerMessage),
      );
      return;
    }
  }
}

export function registerWsHandlers(wss: WebSocketServer): void {
  const registry = new RoomRegistry();

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const userId = (request as AuthenticatedRequest).userId;
    if (!userId) {
      socket.close(1008, "Authentication required");
      return;
    }
    (socket as AuthenticatedWebSocket).userId = userId;

    console.log(`client connected (user ${userId})`);

    // one socket's frames run strictly in order, or a send right after a
    // join could race the join's async access check. Sockets stay concurrent.
    let processingQueue: Promise<void> = Promise.resolve();
    socket.on("message", (data: Buffer) => {
      const raw = data.toString();
      processingQueue = processingQueue
        .then(() =>
          handleMessage(socket as AuthenticatedWebSocket, registry, raw),
        )
        .catch((err: unknown) => {
          console.error("Error handling WS message:", err);
          send(socket, {
            type: "error",
            code: "INTERNAL_ERROR",
            message: "Something went wrong processing that message",
          });
        });
    });

    socket.on("close", () => {
      registry.leaveAll(socket);
      console.log("client disconnected");
    });

    socket.on("error", (err) => {
      console.error("socket error:", err);
    });
  });
}
