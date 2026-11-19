import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useParams } from "react-router";
import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { RoomLabel } from "@/components/chat/RoomLabel";
import { MessageItem } from "@/components/chat/MessageItem";
import { UsernameSuggestions } from "@/components/chat/UsernameSuggestions";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/useAuth";
import { useChatSocket, type WsChatMessage } from "@/ws/useChatSocket";
import {
  ADD_ROOM_MEMBER_MUTATION,
  ADMIN_DELETE_MESSAGE_MUTATION,
  REMOVE_ROOM_MEMBER_MUTATION,
  ROOM_MEMBERS_QUERY,
  ROOM_MEMBERSHIP_CANDIDATES_QUERY,
  ROOM_MESSAGES_QUERY,
  ROOMS_QUERY,
} from "@/graphql/queries";
import {
  edgeToChatMessage,
  type ChatMessage,
  type MessagesQueryData,
  type Room,
  type RoomMemberRow,
  type SuggestionItem,
} from "@/lib/chat";
import { useSuggestionNavigation } from "@/hooks/useSuggestionNavigation";

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
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberUsername, setAddMemberUsername] = useState("");
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [showAddSuggestions, setShowAddSuggestions] = useState(true);
  const addMemberInputRef = useRef<HTMLInputElement>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const draftInputRef = useRef<HTMLInputElement>(null);
  const [removingMemberIds, setRemovingMemberIds] = useState<Set<string>>(
    new Set(),
  );
  const [removeMemberError, setRemoveMemberError] = useState<string | null>(
    null,
  );

  const { data: candidatesData } = useQuery<{
    roomMembershipCandidates: SuggestionItem[];
  }>(ROOM_MEMBERSHIP_CANDIDATES_QUERY, {
    variables: { roomId },
    skip: !roomId || !addMemberOpen,
    fetchPolicy: "network-only",
  });
  const addMemberCandidates = useMemo<SuggestionItem[]>(() => {
    if (!showAddSuggestions) return [];
    const all = candidatesData?.roomMembershipCandidates ?? [];
    const query = addMemberUsername.trim().toLowerCase();
    const matches = query
      ? all.filter((c) => c.username.toLowerCase().startsWith(query))
      : all;
    return matches.slice(0, 8);
  }, [candidatesData, addMemberUsername, showAddSuggestions]);
  const addMemberNav = useSuggestionNavigation(addMemberCandidates.length);

  const mentionCandidates = useMemo<SuggestionItem[]>(() => {
    if (mentionQuery === null) return [];
    const query = mentionQuery.toLowerCase();
    return members
      .filter((m) => m.user.username.toLowerCase().startsWith(query))
      .slice(0, 5)
      .map((m) => ({ id: m.user.id, username: m.user.username }));
  }, [members, mentionQuery]);
  const mentionNav = useSuggestionNavigation(mentionCandidates.length);

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

  const [addRoomMember, { loading: addingMember }] = useMutation<
    {
      addRoomMember: {
        room: { id: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    },
    { roomId: string; username: string }
  >(ADD_ROOM_MEMBER_MUTATION);

  const [removeRoomMember] = useMutation<
    {
      removeRoomMember: {
        room: { id: string } | null;
        userErrors: { field: string[]; message: string }[];
      };
    },
    { roomId: string; userId: string }
  >(REMOVE_ROOM_MEMBER_MUTATION);

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

  function handleDraftChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setDraft(value);
    const cursorPos = event.target.selectionStart ?? value.length;
    const match = value.slice(0, cursorPos).match(/(?:^|\s)@([a-z0-9_]*)$/i);
    mentionNav.setHighlightedIndex(0);
    setMentionQuery(match ? match[1] : null);
  }

  function selectMention(username: string) {
    const input = draftInputRef.current;
    const cursorPos = input?.selectionStart ?? draft.length;
    const before = draft
      .slice(0, cursorPos)
      .replace(/@[a-z0-9_]*$/i, `@${username} `);
    const after = draft.slice(cursorPos);
    setDraft(before + after);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(before.length, before.length);
    });
  }

  function handleDraftKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (mentionQuery === null || mentionCandidates.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      mentionNav.moveDown();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      mentionNav.moveUp();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectMention(mentionCandidates[mentionNav.highlightedIndex].username);
    } else if (event.key === "Escape") {
      setMentionQuery(null);
    }
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

  const canAddMembers = !!membersData && user?.globalRole !== "RESTRICTED";
  const canRemoveMembers = !!membersData && user?.globalRole === "ADMIN";

  function handleAddMemberUsernameChange(event: ChangeEvent<HTMLInputElement>) {
    setAddMemberUsername(event.target.value);
    setShowAddSuggestions(true);
    addMemberNav.setHighlightedIndex(0);
  }

  function selectAddMemberCandidate(username: string) {
    setAddMemberUsername(username);
    setShowAddSuggestions(false);
    addMemberInputRef.current?.focus();
  }

  function handleAddMemberKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showAddSuggestions || addMemberCandidates.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      addMemberNav.moveDown();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      addMemberNav.moveUp();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectAddMemberCandidate(
        addMemberCandidates[addMemberNav.highlightedIndex].username,
      );
    } else if (event.key === "Escape") {
      setShowAddSuggestions(false);
    }
  }

  async function handleAddMember(event: FormEvent) {
    event.preventDefault();
    if (!roomId || !addMemberUsername.trim()) return;
    setAddMemberError(null);
    const result = await addRoomMember({
      variables: { roomId, username: addMemberUsername.trim() },
    });
    const payload = result.data?.addRoomMember;
    if (!payload?.room) {
      setAddMemberError(
        payload?.userErrors[0]?.message ?? "Could not add member",
      );
      return;
    }
    setAddMemberUsername("");
    setAddMemberOpen(false);
    await refetchMembers();
  }

  async function handleRemoveMember(memberUserId: string) {
    if (!roomId) return;
    setRemoveMemberError(null);
    setRemovingMemberIds((prev) => new Set(prev).add(memberUserId));
    try {
      const result = await removeRoomMember({
        variables: { roomId, userId: memberUserId },
      });
      const payload = result.data?.removeRoomMember;
      if (!payload?.room) {
        setRemoveMemberError(
          payload?.userErrors[0]?.message ?? "Could not remove member",
        );
        return;
      }
      await refetchMembers();
    } catch {
      setRemoveMemberError(
        "Could not remove member — you may no longer have permission",
      );
    } finally {
      setRemovingMemberIds((prev) => {
        const next = new Set(prev);
        next.delete(memberUserId);
        return next;
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
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="shrink-0">
              {members.length}{" "}
              <span className="hidden sm:inline">
                member{members.length === 1 ? "" : "s"}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                <RoomLabel
                  isPrivate={room?.isPrivate ?? false}
                  name={room?.name ?? "…"}
                />{" "}
                members
              </DialogTitle>
            </DialogHeader>
            <ul className="space-y-2">
              {members.map((member) => (
                <li key={member.user.id} className="flex items-center gap-2">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      member.isOnline
                        ? "bg-green-500"
                        : "bg-muted-foreground/40",
                    )}
                  />
                  <span>{member.user.username}</span>
                  {member.role === "OWNER" && (
                    <Badge variant="secondary" className="ml-auto">
                      Owner
                    </Badge>
                  )}
                  {canRemoveMembers && member.role !== "OWNER" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-auto px-2 py-0.5 text-xs text-destructive"
                      disabled={removingMemberIds.has(member.user.id)}
                      onClick={() => void handleRemoveMember(member.user.id)}
                    >
                      {removingMemberIds.has(member.user.id)
                        ? "Removing…"
                        : "Remove"}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {removeMemberError && (
              <p className="text-sm text-destructive">{removeMemberError}</p>
            )}
            {canAddMembers && (
              <div className="border-t pt-3">
                {addMemberOpen ? (
                  <form
                    onSubmit={(event) => void handleAddMember(event)}
                    className="flex items-center gap-2"
                  >
                    <div className="relative flex-1">
                      <Input
                        ref={addMemberInputRef}
                        autoFocus
                        placeholder="Username"
                        value={addMemberUsername}
                        onChange={handleAddMemberUsernameChange}
                        onKeyDown={handleAddMemberKeyDown}
                        onBlur={() => setShowAddSuggestions(false)}
                      />
                      <UsernameSuggestions
                        items={addMemberCandidates}
                        highlightedIndex={addMemberNav.highlightedIndex}
                        onSelect={(item) =>
                          selectAddMemberCandidate(item.username)
                        }
                        position="below"
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={addingMember}>
                      Add
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAddMemberOpen(false);
                        setAddMemberUsername("");
                        setAddMemberError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setAddMemberOpen(true);
                      setShowAddSuggestions(true);
                    }}
                  >
                    Add people
                  </Button>
                )}
                {addMemberError && (
                  <p className="mt-2 text-sm text-destructive">
                    {addMemberError}
                  </p>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
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

      <form onSubmit={handleSend} className="flex gap-2 border-t p-4">
        <div className="relative flex-1">
          <Input
            ref={draftInputRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleDraftKeyDown}
            onBlur={() => setMentionQuery(null)}
            placeholder="Message…"
            maxLength={2000}
          />
          <UsernameSuggestions
            items={mentionCandidates}
            highlightedIndex={mentionNav.highlightedIndex}
            onSelect={(item) => selectMention(item.username)}
            position="above"
          />
        </div>
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
