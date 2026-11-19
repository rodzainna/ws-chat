import { useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { useMutation, useQuery } from "@apollo/client";
import { toast } from "sonner";
import { RoomLabel } from "@/components/chat/RoomLabel";
import { MembersDialog } from "@/components/chat/MembersDialog";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { MessageItem } from "@/components/chat/MessageItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/auth/useAuth";
import { useRoomMembers } from "@/hooks/useRoomMembers";
import { useRoomMessages } from "@/hooks/useRoomMessages";
import { useChatSocket, type WsChatMessage } from "@/ws/useChatSocket";
import { ADMIN_DELETE_MESSAGE_MUTATION, ROOMS_QUERY } from "@/graphql/queries";
import { type ChatMessage, type Room } from "@/lib/chat";

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { data: roomsData } = useQuery<{ rooms: Room[] }>(ROOMS_QUERY);
  const room = roomsData?.rooms.find((r) => r.id === roomId);
  const { members, membersLoaded, refetchMembers, setMemberOnline } =
    useRoomMembers(roomId, user?.id);
  const {
    orderedMessages,
    loading,
    historyLoaded,
    loadingOlder,
    scrollContainerRef,
    bottomRef,
    addMessage,
    applyEdit,
    applyDelete,
  } = useRoomMessages(roomId);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [socketError, setSocketError] = useState<string | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
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
        addMessage(message);
      },
      onEdited: applyEdit,
      onDeleted: (messageId) => {
        applyDelete(messageId);
        setConfirmDeleteId((current) =>
          current === messageId ? null : current,
        );
        setDeletePending(false);
      },
      onPresenceChanged: setMemberOnline,
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
          membersLoaded={membersLoaded}
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
