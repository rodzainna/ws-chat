import { useCallback, useEffect, useRef } from "react";
import type { ConnectionEvent, WsChatMessage } from "./ChatConnectionProvider";
import { useChatConnection } from "./useChatConnection";
import {
  SESSION_EXPIRED_MESSAGES,
  DEFAULT_SESSION_EXPIRED_MESSAGE,
} from "./sessionExpiredMessages";

export type { WsChatMessage };

type ChatSocketHandlers = {
  onJoined?: () => void;
  onCreated?: (message: WsChatMessage) => void;
  onEdited?: (messageId: string, content: string, editedAt: string) => void;
  onDeleted?: (messageId: string) => void;
  onPresenceChanged?: (userId: string, online: boolean) => void;
  onError?: (code: string, message: string) => void;
};

export function useChatSocket(roomId: string, handlers: ChatSocketHandlers) {
  const { subscribe, send: sendFrame, setActiveRoom } = useChatConnection();
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    setActiveRoom(roomId);

    const unsubscribe = subscribe((event: ConnectionEvent) => {
      const handlers = handlersRef.current;
      switch (event.type) {
        case "joined":
          if (event.roomId === roomId) handlers.onJoined?.();
          return;
        case "message_created":
          if (event.message.roomId === roomId) {
            handlers.onCreated?.(event.message);
          }
          return;
        case "message_edited":
          handlers.onEdited?.(event.messageId, event.content, event.editedAt);
          return;
        case "message_deleted":
          handlers.onDeleted?.(event.messageId);
          return;
        case "room_deleted":
          if (event.roomId === roomId) {
            handlers.onError?.("ROOM_DELETED", "This room has been deleted.");
          }
          return;
        case "removed_from_room":
          if (event.roomId === roomId) {
            handlers.onError?.(
              "REMOVED_FROM_ROOM",
              "You've been removed from this room.",
            );
          }
          return;
        case "presence_changed":
          handlers.onPresenceChanged?.(event.userId, event.online);
          return;
        case "session_expired":
          handlers.onError?.(
            "SESSION_EXPIRED",
            SESSION_EXPIRED_MESSAGES[event.reason] ??
              DEFAULT_SESSION_EXPIRED_MESSAGE,
          );
          return;
        case "connection_lost":
          handlers.onError?.(
            "CONNECTION_LOST",
            "Connection lost — reload the page to reconnect.",
          );
          return;
        case "error":
          handlers.onError?.(event.code, event.message);
          return;
        case "room_activity":
          return;
      }
    });

    return () => {
      unsubscribe();
      sendFrame({ type: "leave", roomId });
      setActiveRoom(null);
    };
  }, [roomId, subscribe, sendFrame, setActiveRoom]);

  const send = useCallback(
    (type: "send" | "edit" | "delete", body: Record<string, unknown>) =>
      sendFrame({ type, roomId, ...body }),
    [roomId, sendFrame],
  );

  const sendMessage = useCallback(
    (content: string) => send("send", { content }),
    [send],
  );
  const editMessage = useCallback(
    (messageId: string, content: string) =>
      send("edit", { messageId, content }),
    [send],
  );
  const deleteMessage = useCallback(
    (messageId: string) => send("delete", { messageId }),
    [send],
  );

  return { sendMessage, editMessage, deleteMessage };
}
