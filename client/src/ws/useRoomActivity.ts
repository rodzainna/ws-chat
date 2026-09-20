import { useEffect, useRef, useState } from "react";
import { useChatConnection } from "./useChatConnection";
import type { ConnectionEvent } from "./ChatConnectionProvider";

export type RoomActivity = { unreadCount: number; hasUnreadMention: boolean };

export function useRoomActivity(
  activeRoomId: string | null,
): Record<string, RoomActivity> {
  const { subscribe } = useChatConnection();
  const [activity, setActivity] = useState<Record<string, RoomActivity>>({});
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return subscribe((event: ConnectionEvent) => {
      if (event.type !== "room_activity") return;
      if (event.roomId === activeRoomId) return;
      if (seenMessageIdsRef.current.has(event.messageId)) return;
      if (seenMessageIdsRef.current.size > 50) {
        seenMessageIdsRef.current.clear();
      }
      seenMessageIdsRef.current.add(event.messageId);
      setActivity((prev) => {
        const current = prev[event.roomId] ?? {
          unreadCount: 0,
          hasUnreadMention: false,
        };
        return {
          ...prev,
          [event.roomId]: {
            unreadCount: current.unreadCount + 1,
            hasUnreadMention: current.hasUnreadMention || event.mentionsYou,
          },
        };
      });
    });
  }, [subscribe, activeRoomId]);

  useEffect(() => {
    if (!activeRoomId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivity((prev) => {
      if (!(activeRoomId in prev)) return prev;
      const next = { ...prev };
      delete next[activeRoomId];
      return next;
    });
  }, [activeRoomId]);

  return activity;
}
