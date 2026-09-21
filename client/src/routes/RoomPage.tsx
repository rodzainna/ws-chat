import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useParams } from "react-router";
import { gql, useMutation, useQuery } from "@apollo/client";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomLabel } from "@/components/RoomLabel";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { ROOMS_QUERY } from "@/graphql/queries";
import { useSuggestionNavigation } from "@/hooks/useSuggestionNavigation";

type Room = { id: string; name: string; isPrivate: boolean };

type ChatMessage = {
  id: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  mentionedUsernames: string[];
};

type RoomMemberRow = {
  user: { id: string; username: string };
  role: "OWNER" | "MEMBER";
  isOnline: boolean;
};

const ADMIN_DELETE_MESSAGE_MUTATION = gql`
  mutation AdminDeleteMessage($messageId: ID!) {
    deleteMessage(messageId: $messageId) {
      message {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ROOM_MEMBERS_QUERY = gql`
  query RoomMembers($roomId: ID!) {
    roomMembers(roomId: $roomId) {
      user {
        id
        username
      }
      role
      isOnline
    }
  }
`;

const ADD_ROOM_MEMBER_MUTATION = gql`
  mutation AddRoomMember($roomId: ID!, $username: String!) {
    addRoomMember(roomId: $roomId, username: $username) {
      room {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const REMOVE_ROOM_MEMBER_MUTATION = gql`
  mutation RemoveRoomMember($roomId: ID!, $userId: ID!) {
    removeRoomMember(roomId: $roomId, userId: $userId) {
      room {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ROOM_MEMBERSHIP_CANDIDATES_QUERY = gql`
  query RoomMembershipCandidates($roomId: ID!) {
    roomMembershipCandidates(roomId: $roomId) {
      id
      username
    }
  }
`;

const ROOM_MESSAGES_QUERY = gql`
  query RoomMessages($roomId: ID!) {
    messages(roomId: $roomId, first: 50) {
      edges {
        node {
          id
          userId
          username
          content
          createdAt
          editedAt
          deletedAt
          mentionedUsernames
        }
      }
    }
  }
`;

function formatMessageTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  if (isToday) return time;

  const datePart = date.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
  });
  return `${datePart} ${time}`;
}

function renderContentWithMentions(
  content: string,
  mentionedUsernames: string[],
) {
  if (mentionedUsernames.length === 0) return content;
  const pattern = new RegExp(
    `(?<![a-z0-9_])@(${mentionedUsernames.join("|")})\\b`,
    "gi",
  );
  return content.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <span
        key={index}
        className="rounded bg-amber-400 px-1 font-medium text-amber-950"
      >
        @{part}
      </span>
    ) : (
      part
    ),
  );
}

type SuggestionItem = { id: string; username: string };

// shared by the @mention picker and "Add people". onMouseDown so the input's
// onBlur doesn't close the list before the click registers.
function UsernameSuggestions({
  items,
  highlightedIndex,
  onSelect,
  position,
}: {
  items: SuggestionItem[];
  highlightedIndex: number;
  onSelect: (item: SuggestionItem) => void;
  position: "above" | "below";
}) {
  if (items.length === 0) return null;
  return (
    <ul
      className={cn(
        "absolute z-10 max-h-48 w-full overflow-y-auto rounded-md border bg-popover py-1 shadow-md",
        position === "above" ? "bottom-full mb-1" : "top-full mt-1",
      )}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
          className={cn(
            "cursor-pointer px-3 py-1.5 text-sm",
            index === highlightedIndex ? "bg-muted" : "hover:bg-muted",
          )}
        >
          {item.username}
        </li>
      ))}
    </ul>
  );
}

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

  const { data, loading } = useQuery<{
    messages: {
      edges: {
        node: {
          id: string;
          userId: string;
          username: string;
          content: string;
          createdAt: string;
          editedAt: string | null;
          deletedAt: string | null;
          mentionedUsernames: string[];
        };
      }[];
    };
  }>(ROOM_MESSAGES_QUERY, {
    variables: { roomId },
    fetchPolicy: "network-only",
    skip: !roomId,
  });

  useEffect(() => {
    if (!data || historyLoaded) return;
    // merge, don't replace: live messages can arrive before history resolves
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages((prev) => {
      const history = data.messages.edges.map(({ node }) => ({
        id: node.id,
        userId: node.userId,
        username: node.username,
        content: node.content,
        createdAt: node.createdAt,
        editedAt: node.editedAt,
        deleted: node.deletedAt !== null,
        mentionedUsernames: node.mentionedUsernames,
      }));
      const historyIds = new Set(history.map((m) => m.id));
      const liveOnly = prev.filter((m) => !historyIds.has(m.id));
      return [...history, ...liveOnly];
    });
    setHistoryLoaded(true);
  }, [data, historyLoaded]);

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

  useEffect(() => {
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

  const isRoomOwner = members.some(
    (member) => member.user.id === user?.id && member.role === "OWNER",
  );
  const canAddMembers =
    !!membersData && (isRoomOwner || user?.globalRole === "ADMIN");

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
                  {canAddMembers && member.role !== "OWNER" && (
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
      <ScrollArea className="flex-1 px-4">
        <div className="mx-auto max-w-full space-y-3 py-4">
          {loading && !historyLoaded && (
            <p className="text-sm text-muted-foreground">Loading messages…</p>
          )}
          {orderedMessages.length === 0 && historyLoaded && (
            <p className="text-sm text-muted-foreground">
              No messages yet — say hello.
            </p>
          )}
          {orderedMessages.map((message) => {
            const isOwn = message.userId === user?.id;
            const isEditing = editingId === message.id;
            return (
              <div
                key={message.id}
                className={cn(
                  "group flex flex-col text-sm",
                  isOwn ? "items-end" : "items-start",
                )}
              >
                <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  {!isOwn && (
                    <span className="inline-flex items-center gap-1">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          onlineByUserId.get(message.userId)
                            ? "bg-green-500"
                            : "bg-muted-foreground/40",
                        )}
                      />
                      <span className="font-medium">{message.username}</span>
                    </span>
                  )}
                  <span>{formatMessageTimestamp(message.createdAt)}</span>
                  <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                    {message.editedAt && !message.deleted && (
                      <span>(edited)</span>
                    )}
                    {!message.deleted && !isEditing && (
                      <span className="hidden gap-1 group-hover:flex">
                        {isOwn && (
                          <Button
                            type="button"
                            variant="linkMuted"
                            size="inline"
                            onClick={() => startEdit(message)}
                          >
                            Edit
                          </Button>
                        )}
                        {(isOwn || user?.globalRole === "ADMIN") && (
                          <AlertDialog
                            open={confirmDeleteId === message.id}
                            onOpenChange={(open) =>
                              setConfirmDeleteId(open ? message.id : null)
                            }
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="linkMuted"
                                size="inline"
                              >
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Delete this message?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This can't be undone — it'll show as "[message
                                  deleted]" to everyone in the room.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  disabled={deletePending}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    confirmDelete(message);
                                  }}
                                >
                                  {deletePending ? (
                                    <>
                                      <Loader2Icon className="animate-spin" />
                                      Deleting…
                                    </>
                                  ) : (
                                    "Delete"
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <form
                    onSubmit={submitEdit}
                    className="flex items-center w-full max-w-[70%] gap-2"
                  >
                    <Input
                      autoFocus
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                    />
                    <div className="flex items-center gap-0.5">
                      <Button size="sm" type="submit">
                        Save
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        variant="secondary"
                        onClick={() => setEditingId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-3 py-2",
                      isOwn ? "bg-primary text-primary-foreground" : "bg-muted",
                      message.deleted && "italic opacity-70",
                    )}
                  >
                    {renderContentWithMentions(
                      message.content,
                      message.mentionedUsernames,
                    )}
                  </div>
                )}
              </div>
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
