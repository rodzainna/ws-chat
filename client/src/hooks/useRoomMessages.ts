import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLazyQuery, useQuery } from "@apollo/client";
import { ROOM_MESSAGES_QUERY } from "@/graphql/queries";
import {
  edgeToChatMessage,
  type ChatMessage,
  type MessagesQueryData,
} from "@/lib/chat";
import type { WsChatMessage } from "@/ws/useChatSocket";

const NEAR_TOP_THRESHOLD_PX = 150;

// a room's messages: the newest page on open, older pages as you scroll up
// (keeping your place), and live changes from the socket. Also owns the
// scroll behaviour, so it hands back the refs the page attaches to the DOM.
export function useRoomMessages(roomId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [hasPreviousPage, setHasPreviousPage] = useState(false);
  const [startCursor, setStartCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // a ref, not state: a burst of scroll events before the next render would
  // all pass a state-based guard
  const fetchingOlderRef = useRef(false);
  const pendingScrollRestoreRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const scrollAdjustmentRef = useRef<"initial-load" | "prepend" | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, loading } = useQuery<MessagesQueryData>(ROOM_MESSAGES_QUERY, {
    variables: { roomId },
    fetchPolicy: "network-only",
    skip: !roomId,
  });

  useEffect(() => {
    if (!data || historyLoaded) return;
    // merge, don't replace: live messages can arrive before history resolves
    scrollAdjustmentRef.current = "initial-load";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages((prev) => {
      const history = data.messages.edges.map(edgeToChatMessage);
      const historyIds = new Set(history.map((m) => m.id));
      const liveOnly = prev.filter((m) => !historyIds.has(m.id));
      return [...history, ...liveOnly];
    });
    setHistoryLoaded(true);
    setHasPreviousPage(data.messages.pageInfo.hasPreviousPage);
    setStartCursor(data.messages.pageInfo.startCursor);
  }, [data, historyLoaded]);

  const [fetchOlderMessages] = useLazyQuery<MessagesQueryData>(
    ROOM_MESSAGES_QUERY,
    {
      fetchPolicy: "network-only",
      onCompleted: (older) => {
        const container = scrollContainerRef.current;
        if (container) {
          pendingScrollRestoreRef.current = {
            scrollHeight: container.scrollHeight,
            scrollTop: container.scrollTop,
          };
        }
        scrollAdjustmentRef.current = "prepend";
        setMessages((prev) => [
          ...older.messages.edges.map(edgeToChatMessage),
          ...prev,
        ]);
        setHasPreviousPage(older.messages.pageInfo.hasPreviousPage);
        setStartCursor(older.messages.pageInfo.startCursor);
        fetchingOlderRef.current = false;
        setLoadingOlder(false);
      },
      onError: () => {
        fetchingOlderRef.current = false;
        setLoadingOlder(false);
      },
    },
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !roomId) return;
    function handleScroll() {
      if (fetchingOlderRef.current || !hasPreviousPage) return;
      if (!container || container.scrollTop > NEAR_TOP_THRESHOLD_PX) return;
      fetchingOlderRef.current = true;
      setLoadingOlder(true);
      void fetchOlderMessages({ variables: { roomId, before: startCursor } });
    }
    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasPreviousPage, startCursor, roomId, fetchOlderMessages]);

  useLayoutEffect(() => {
    const kind = scrollAdjustmentRef.current;
    scrollAdjustmentRef.current = null;
    const container = scrollContainerRef.current;

    if (kind === "prepend") {
      const pending = pendingScrollRestoreRef.current;
      pendingScrollRestoreRef.current = null;
      if (container && pending) {
        const heightAdded = container.scrollHeight - pending.scrollHeight;
        container.scrollTop = pending.scrollTop + heightAdded;
      }
      return;
    }

    if (kind === "initial-load") {
      if (container) container.scrollTop = container.scrollHeight;
      return;
    }

    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const orderedMessages = useMemo(
    () => [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [messages],
  );

  function addMessage(message: WsChatMessage) {
    setMessages((prev) =>
      prev.some((m) => m.id === message.id)
        ? prev
        : [...prev, { ...message, deleted: false }],
    );
  }

  function applyEdit(messageId: string, content: string, editedAt: string) {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, content, editedAt } : m)),
    );
  }

  function applyDelete(messageId: string) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? { ...m, content: "[message deleted]", deleted: true }
          : m,
      ),
    );
  }

  return {
    orderedMessages,
    loading,
    historyLoaded,
    loadingOlder,
    scrollContainerRef,
    bottomRef,
    addMessage,
    applyEdit,
    applyDelete,
  };
}
