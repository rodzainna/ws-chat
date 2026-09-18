import { useCallback, useEffect, useRef } from "react";

export type WsChatMessage = {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  mentionedUsernames: string[];
};

type ServerMessage =
  | { type: "joined"; roomId: string }
  | { type: "message_created"; message: WsChatMessage }
  | {
      type: "message_edited";
      messageId: string;
      content: string;
      editedAt: string;
    }
  | { type: "message_deleted"; messageId: string }
  | { type: "error"; code: string; message: string };

type ChatSocketHandlers = {
  onJoined?: () => void;
  onCreated?: (message: WsChatMessage) => void;
  onEdited?: (messageId: string, content: string, editedAt: string) => void;
  onDeleted?: (messageId: string) => void;
  onError?: (code: string, message: string) => void;
};

function wsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function useChatSocket(roomId: string, handlers: ChatSocketHandlers) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socket = new WebSocket(wsUrl());
    socketRef.current = socket;
    let closingIntentionally = false;

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify({ type: "join", roomId }));
    });

    socket.addEventListener("message", (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as ServerMessage;
      const handlers = handlersRef.current;

      switch (data.type) {
        case "joined":
          handlers.onJoined?.();
          return;
        case "message_created":
          handlers.onCreated?.(data.message);
          return;
        case "message_edited":
          handlers.onEdited?.(data.messageId, data.content, data.editedAt);
          return;
        case "message_deleted":
          handlers.onDeleted?.(data.messageId);
          return;
        case "error":
          handlers.onError?.(data.code, data.message);
          return;
      }
    });

    socket.addEventListener("close", () => {
      if (closingIntentionally) return;
      handlersRef.current.onError?.(
        "CONNECTION_LOST",
        "Connection lost — reload the page to reconnect.",
      );
    });

    return () => {
      closingIntentionally = true;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "leave", roomId }));
      }
      socket.close();
      socketRef.current = null;
    };
  }, [roomId]);

  const send = useCallback(
    (type: "send" | "edit" | "delete", body: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type, roomId, ...body }));
    },
    [roomId],
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
