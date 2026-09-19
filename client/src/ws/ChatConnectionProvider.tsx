import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { onSessionRefreshed } from "@/lib/apollo";
import { ChatConnectionContext } from "./useChatConnection";

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

export type ServerMessage =
  | { type: "joined"; roomId: string }
  | { type: "message_created"; message: WsChatMessage }
  | {
      type: "message_edited";
      messageId: string;
      content: string;
      editedAt: string;
    }
  | { type: "message_deleted"; messageId: string }
  | {
      type: "session_expired";
      reason: "deactivated" | "token_expired" | "logged_out";
    }
  | { type: "presence_changed"; userId: string; online: boolean }
  | {
      type: "room_activity";
      roomId: string;
      messageId: string;
      mentionsYou: boolean;
    }
  | { type: "error"; code: string; message: string };

export type ConnectionEvent = ServerMessage | { type: "connection_lost" };

export type ChatConnectionContextValue = {
  subscribe(this: void, listener: (event: ConnectionEvent) => void): () => void;
  send(this: void, frame: Record<string, unknown>): boolean;
  setActiveRoom(this: void, roomId: string | null): void;
};

function wsUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

export function ChatConnectionProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<(event: ConnectionEvent) => void>());
  const socketRef = useRef<WebSocket | null>(null);
  const activeRoomRef = useRef<string | null>(null);

  const dispatch = useCallback((event: ConnectionEvent) => {
    for (const listener of listenersRef.current) listener(event);
  }, []);

  const subscribe = useCallback(
    (listener: (event: ConnectionEvent) => void) => {
      listenersRef.current.add(listener);
      return () => listenersRef.current.delete(listener);
    },
    [],
  );

  const send = useCallback((frame: Record<string, unknown>): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(frame));
    return true;
  }, []);

  const setActiveRoom = useCallback(
    (roomId: string | null) => {
      activeRoomRef.current = roomId;
      if (roomId) send({ type: "join", roomId });
    },
    [send],
  );

  useEffect(() => {
    function connect(
      onReady: () => void,
      onCloseBeforeReady?: () => void,
    ): { socket: WebSocket; markIntentional: () => void } {
      const socket = new WebSocket(wsUrl());
      let closingIntentionally = false;
      let ready = false;

      socket.addEventListener("open", () => {
        const roomId = activeRoomRef.current;
        if (roomId) {
          socket.send(JSON.stringify({ type: "join", roomId }));
        } else {
          ready = true;
          onReady();
        }
      });

      socket.addEventListener("message", (event: MessageEvent<string>) => {
        const data = JSON.parse(event.data) as ServerMessage;
        dispatch(data);

        if (data.type === "joined" && !ready) {
          ready = true;
          onReady();
        }
        if (data.type === "session_expired") {
          closingIntentionally = true;
        }
      });

      socket.addEventListener("close", () => {
        if (!ready && onCloseBeforeReady) {
          onCloseBeforeReady();
          return;
        }
        if (closingIntentionally) return;
        dispatch({ type: "connection_lost" });
      });

      return { socket, markIntentional: () => (closingIntentionally = true) };
    }

    let active = connect(() => {});
    socketRef.current = active.socket;

    let pending: ReturnType<typeof connect> | null = null;

    // make-before-break: swap only once the new socket is ready. Consumers
    // dedupe by message id during the overlap.
    const unsubscribe = onSessionRefreshed(() => {
      if (pending) return;
      pending = connect(
        () => {
          active.markIntentional();
          active.socket.close();
          socketRef.current = pending!.socket;
          active = pending!;
          pending = null;
        },
        () => {
          pending = null;
        },
      );
    });

    return () => {
      unsubscribe();
      active.markIntentional();
      active.socket.close();
      if (pending) {
        pending.markIntentional();
        pending.socket.close();
      }
      socketRef.current = null;
    };
  }, [dispatch]);

  const value = useMemo(
    () => ({ subscribe, send, setActiveRoom }),
    [subscribe, send, setActiveRoom],
  );

  return (
    <ChatConnectionContext.Provider value={value}>
      {children}
    </ChatConnectionContext.Provider>
  );
}
