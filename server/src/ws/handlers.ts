import type { IncomingMessage } from "node:http";
import type { WebSocket, WebSocketServer } from "ws";
import { RoomRegistry } from "./roomRegistry.js";
import type { ConnectionRegistry } from "./connectionRegistry.js";
import type { AuthenticatedRequest, AuthenticatedWebSocket } from "./types.js";
import {
  parseClientMessage,
  sendServerMessage as send,
  type ChatMessage,
  type ClientMessage,
  type ServerMessage,
} from "./messages.js";
import {
  canAccessRoom,
  findMemberUserIdsForRoom,
  findRoomIdsForUser,
  findRoomMembersByUsernames,
} from "../db/rooms.js";
import {
  createMessage,
  findMessageById,
  editMessage,
  softDeleteMessage,
  type MessageWithAuthor,
} from "../db/messages.js";
import { validateMessageContent } from "../messages/validation.js";
import { extractMentionedUsernames } from "../messages/mentions.js";
import { tryConsumeMessageToken } from "../messages/rateLimit.js";
import type { Message } from "../generated/prisma/client.js";

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
  connectionRegistry: ConnectionRegistry,
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
      // before the membership check, so rejected sends still cost a token
      if (!tryConsumeMessageToken(userId)) {
        send(socket, {
          type: "error",
          code: "RATE_LIMITED",
          message: "You're sending messages too fast — slow down a bit",
        });
        return;
      }

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
      broadcastRoomActivity(
        registry.getJoinedSockets(message.roomId),
        connectionRegistry,
        message.roomId,
        created.id,
        userId,
        new Set(mentionedUsers.map((u) => u.id)),
      ).catch((err: unknown) => {
        console.error("Error broadcasting room_activity:", err);
      });
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

const HEARTBEAT_INTERVAL_MS = 30_000;

// a socket that didn't answer the previous ping is dead (dropped network,
// killed client) and gets terminated; its "close" handler does the cleanup
function startHeartbeat(wss: WebSocketServer): void {
  setInterval(() => {
    for (const socket of wss.clients) {
      const authSocket = socket as AuthenticatedWebSocket;
      if (authSocket.isAlive === false) {
        authSocket.terminate();
        continue;
      }
      authSocket.isAlive = false;
      authSocket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS).unref();
}

async function broadcastPresenceChange(
  registry: RoomRegistry,
  userId: string,
  online: boolean,
): Promise<void> {
  const roomIds = await findRoomIdsForUser(userId);
  for (const roomId of roomIds) {
    registry.broadcast(
      roomId,
      JSON.stringify({
        type: "presence_changed",
        userId,
        online,
      } satisfies ServerMessage),
    );
  }
}

async function broadcastRoomActivity(
  // a snapshot, not a live lookup: a join during the DB await below could
  // otherwise leave a member with neither the message nor the unread signal
  joinedSockets: ReadonlySet<WebSocket>,
  connectionRegistry: ConnectionRegistry,
  roomId: string,
  messageId: string,
  senderId: string,
  mentionedUserIds: ReadonlySet<string>,
): Promise<void> {
  const memberUserIds = await findMemberUserIdsForRoom(roomId);
  for (const memberUserId of memberUserIds) {
    if (memberUserId === senderId) continue;
    const mentionsYou = mentionedUserIds.has(memberUserId);
    for (const socket of connectionRegistry.getSockets(memberUserId)) {
      if (joinedSockets.has(socket)) continue;
      send(socket, { type: "room_activity", roomId, messageId, mentionsYou });
    }
  }
}

export function registerWsHandlers(
  wss: WebSocketServer,
  registry: RoomRegistry,
  connectionRegistry: ConnectionRegistry,
): void {
  startHeartbeat(wss);

  wss.on("connection", (socket: WebSocket, request: IncomingMessage) => {
    const userId = (request as AuthenticatedRequest).userId;
    const expiresAt = (request as AuthenticatedRequest).expiresAt;
    if (!userId || !expiresAt) {
      socket.close(1008, "Authentication required");
      return;
    }
    const authSocket = socket as AuthenticatedWebSocket;
    authSocket.userId = userId;
    authSocket.isAlive = true;
    socket.on("pong", () => {
      authSocket.isAlive = true;
    });

    const justCameOnline = connectionRegistry.register(userId, socket);
    if (justCameOnline) {
      broadcastPresenceChange(registry, userId, true).catch((err: unknown) => {
        console.error("Error broadcasting presence (online):", err);
      });
    }

    const expiryTimer = setTimeout(
      () => {
        send(socket, { type: "session_expired", reason: "token_expired" });
        socket.close(4001, "token_expired");
      },
      Math.max(expiresAt - Date.now(), 0),
    ).unref();

    console.log(`client connected (user ${userId})`);

    // one socket's frames run strictly in order, or a send right after a
    // join could race the join's async access check. Sockets stay concurrent.
    let processingQueue: Promise<void> = Promise.resolve();
    socket.on("message", (data: Buffer) => {
      const raw = data.toString();
      processingQueue = processingQueue
        .then(() =>
          handleMessage(
            socket as AuthenticatedWebSocket,
            registry,
            connectionRegistry,
            raw,
          ),
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
      clearTimeout(expiryTimer);
      registry.leaveAll(socket);
      const justWentOffline = connectionRegistry.unregister(userId, socket);
      if (justWentOffline) {
        broadcastPresenceChange(registry, userId, false).catch(
          (err: unknown) => {
            console.error("Error broadcasting presence (offline):", err);
          },
        );
      }
      console.log("client disconnected");
    });

    socket.on("error", (err) => {
      console.error("socket error:", err);
    });
  });
}
