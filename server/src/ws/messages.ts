import type { WebSocket } from "ws";

export type ClientMessage =
  | { type: "join"; roomId: string }
  | { type: "leave"; roomId: string }
  | { type: "send"; roomId: string; content: string }
  | { type: "edit"; roomId: string; messageId: string; content: string }
  | { type: "delete"; roomId: string; messageId: string };

export type ChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  mentionedUsernames: string[];
};

export type SessionExpiredReason = "deactivated";

export type ServerMessage =
  | { type: "joined"; roomId: string }
  | { type: "message_created"; message: ChatMessage }
  | {
      type: "message_edited";
      messageId: string;
      content: string;
      editedAt: string;
    }
  | { type: "message_deleted"; messageId: string }
  | { type: "room_deleted"; roomId: string }
  | { type: "session_expired"; reason: SessionExpiredReason }
  | { type: "error"; code: string; message: string };

export function sendServerMessage(
  socket: WebSocket,
  message: ServerMessage,
): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

type ParseResult =
  | { ok: true; message: ClientMessage }
  | { ok: false; code: string; message: string };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function invalidFrame(message: string): ParseResult {
  return { ok: false, code: "INVALID_FRAME", message };
}

export function parseClientMessage(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {
      ok: false,
      code: "INVALID_JSON",
      message: "Frame is not valid JSON",
    };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return invalidFrame("Frame must be a JSON object");
  }

  const { type } = parsed as Record<string, unknown>;
  if (typeof type !== "string") {
    return invalidFrame('Frame must have a string "type" field');
  }

  switch (type) {
    case "join":
    case "leave": {
      const { roomId } = parsed as Record<string, unknown>;
      if (!isNonEmptyString(roomId)) {
        return invalidFrame(`"${type}" requires a non-empty roomId`);
      }
      return { ok: true, message: { type, roomId } };
    }
    case "send": {
      const { roomId, content } = parsed as Record<string, unknown>;
      if (!isNonEmptyString(roomId)) {
        return invalidFrame('"send" requires a non-empty roomId');
      }
      if (typeof content !== "string") {
        return invalidFrame('"send" requires string content');
      }
      return { ok: true, message: { type: "send", roomId, content } };
    }
    case "edit": {
      const { roomId, messageId, content } = parsed as Record<string, unknown>;
      if (!isNonEmptyString(roomId)) {
        return invalidFrame('"edit" requires a non-empty roomId');
      }
      if (!isNonEmptyString(messageId)) {
        return invalidFrame('"edit" requires a non-empty messageId');
      }
      if (typeof content !== "string") {
        return invalidFrame('"edit" requires string content');
      }
      return {
        ok: true,
        message: { type: "edit", roomId, messageId, content },
      };
    }
    case "delete": {
      const { roomId, messageId } = parsed as Record<string, unknown>;
      if (!isNonEmptyString(roomId)) {
        return invalidFrame('"delete" requires a non-empty roomId');
      }
      if (!isNonEmptyString(messageId)) {
        return invalidFrame('"delete" requires a non-empty messageId');
      }
      return { ok: true, message: { type: "delete", roomId, messageId } };
    }
    default:
      return {
        ok: false,
        code: "UNKNOWN_TYPE",
        message: `Unknown message type: ${type}`,
      };
  }
}
