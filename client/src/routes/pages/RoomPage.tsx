import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useParams } from "react-router";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { toast } from "sonner";
import { RoomLabel } from "@/components/chat/RoomLabel";
import { MembersDialog } from "@/components/chat/MembersDialog";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageItem } from "@/components/chat/MessageItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/auth/useAuth";
import { useChatSocket, type WsChatMessage } from "@/ws/useChatSocket";
import {
  ADMIN_DELETE_MESSAGE_MUTATION,
  ROOM_MEMBERS_QUERY,
  ROOM_MESSAGES_QUERY,
  ROOMS_QUERY,
} from "@/graphql/queries";
import {
  edgeToChatMessage,
  type ChatMessage,
  type MessagesQueryData,
  type Room,
  type RoomMemberRow,
} from "@/lib/chat";

const NEAR_TOP_THRESHOLD_PX = 150;

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { data: roomsData } = useQuery<{ rooms: Room[] }>(ROOMS_QUERY);
  const room = roomsData?.rooms.find((r) => r.id === roomId);
  const { data: membersData, refetch: refetchMembers } = useQuery<{
    roomMembers: RoomMemberRow[];
  }>(ROOM_MEMBERS_QUERY, { variables: { roomId }, skip: !roomId });
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  useEffect(() => {
    if (!membersData) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMembers(
      membersData.roomMembers
        .map((member) =>
          member.user.id === user?.id ? { ...member, isOnline: true } : member,
        )
        .sort((a, b) => {
          if (a.role !== b.role) return a.role === "OWNER" ? -1 : 1;
          return a.user.username.localeCompare(b.user.username);
        }),
    );
  }, [membersData, user?.id]);
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
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [socketError, setSocketError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  // sent-but-unconfirmed drafts, so a rate-limited send can be restored. FIFO
  // works because the server answers a socket's frames in order. (A second
  // tab in the same room can throw this off; accepted.)
  const pendingSendsRef = useRef<string[]>([]);
  const shiftedMessageIdsRef = useRef<Set<string>>(new Set());

  const [adminDeleteMessage] = useMutation<
    {
      deleteMessage: {
        message: { id: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    },
    { messageId: string }
  >(ADMIN_DELETE_MESSAGE_MUTATION);

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

  const { sendMessage, editMessage, deleteMessage } = useChatSocket(
    roomId ?? "",
    {
      onCreated: (message: WsChatMessage) => {
        if (
          message.userId === user?.id &&
          !shiftedMessageIdsRef.current.has(message.id)
        ) {
          if (shiftedMessageIdsRef.current.size > 50) {
            shiftedMessageIdsRef.current.clear();
          }
          shiftedMessageIdsRef.current.add(message.id);
          pendingSendsRef.current.shift();
        }
        setMessages((prev) =>
          prev.some((m) => m.id === message.id)
            ? prev
            : [...prev, { ...message, deleted: false }],
        );
      },
      onEdited: (messageId, content, editedAt) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId ? { ...m, content, editedAt } : m,
          ),
        );
      },
      onDeleted: (messageId) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, content: "[message deleted]", deleted: true }
              : m,
          ),
        );
        setConfirmDeleteId((current) =>
          current === messageId ? null : current,
        );
        setDeletePending(false);
      },
      onPresenceChanged: (userId, online) => {
        setMembers((prev) =>
          prev.map((m) =>
            m.user.id === userId ? { ...m, isOnline: online } : m,
          ),
        );
      },
      onMembersChanged: () => {
        void refetchMembers();
      },
      onError: (code, message) => {
        if (code === "RATE_LIMITED") {
          toast.warning(message);
          const rejected = pendingSendsRef.current.shift();
          if (rejected !== undefined) {
            setDraft((current) => current || rejected);
          }
          return;
        }
        setSocketError(message);
        setDeletePending(false);
      },
    },
  );

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
  const onlineByUserId = useMemo(
    () => new Map(members.map((m) => [m.user.id, m.isOnline])),
    [members],
  );

  function handleSend(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    if (!sendMessage(draft)) return;
    setSocketError(null);
    pendingSendsRef.current.push(draft);
    setDraft("");
  }

  function startEdit(message: ChatMessage) {
    setEditingId(message.id);
    setEditDraft(message.content);
  }

  function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingId || !editDraft.trim()) return;
    editMessage(editingId, editDraft);
    setEditingId(null);
  }

  async function handleAdminDelete(messageId: string) {
    try {
      const result = await adminDeleteMessage({ variables: { messageId } });
      const payload = result.data?.deleteMessage;
      if (!payload?.message) {
        toast.error(
          payload?.userErrors[0]?.message ?? "Could not delete message",
        );
      }
    } catch {
      toast.error("Could not delete message — you may no longer be an admin");
    }
  }

  function confirmDelete(message: ChatMessage) {
    setDeletePending(true);
    if (message.userId === user?.id) {
      if (!deleteMessage(message.id)) {
        setDeletePending(false);
        toast.error("Could not delete — connection lost. Reload the page.");
      }
    } else {
      void handleAdminDelete(message.id).finally(() => {
        setDeletePending(false);
        setConfirmDeleteId(null);
      });
    }
  }

  if (!roomId) return null;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <span className="min-w-0 flex-1 truncate font-medium">
          <RoomLabel
            isPrivate={room?.isPrivate ?? false}
            name={room?.name ?? "…"}
          />
        </span>
        {room?.isPrivate && (
          <Badge variant="secondary" className="shrink-0">
            Private
          </Badge>
        )}
        <MembersDialog
          roomId={roomId}
          room={room}
          members={members}
          membersLoaded={!!membersData}
          refetchMembers={refetchMembers}
        />
      </div>
      <ScrollArea className="flex-1 px-4" viewportRef={scrollContainerRef}>
        <div className="mx-auto max-w-full space-y-3 py-4">
          {loading && !historyLoaded && (
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          )}
          {loadingOlder && (
            <p className="text-center text-sm text-muted-foreground">
              Loading older messages…
            </p>
          )}
          {orderedMessages.length === 0 && historyLoaded && (
            <p className="text-sm text-muted-foreground">
              No messages yet — say hello.
            </p>
          )}
          {orderedMessages.map((message) => {
            const isOwn = message.userId === user?.id;
            return (
              <MessageItem
                key={message.id}
                message={message}
                isOwn={isOwn}
                isOnline={onlineByUserId.get(message.userId) ?? false}
                canDelete={isOwn || user?.globalRole === "ADMIN"}
                isEditing={editingId === message.id}
                editDraft={editDraft}
                onEditDraftChange={setEditDraft}
                onStartEdit={() => startEdit(message)}
                onSubmitEdit={submitEdit}
                onCancelEdit={() => setEditingId(null)}
                deleteDialogOpen={confirmDeleteId === message.id}
                onDeleteDialogOpenChange={(open) =>
                  setConfirmDeleteId(open ? message.id : null)
                }
                deletePending={deletePending}
                onConfirmDelete={() => confirmDelete(message)}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {socketError && (
        <p className="px-4 text-sm text-destructive">{socketError}</p>
      )}

      <MessageComposer
        draft={draft}
        onDraftChange={setDraft}
        onSubmit={handleSend}
        members={members}
      />
    </div>
  );
}
