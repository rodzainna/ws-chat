import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { gql, useMutation, useQuery } from "@apollo/client";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { data: roomsData } = useQuery<{ rooms: Room[] }>(ROOMS_QUERY);
  const room = roomsData?.rooms.find((r) => r.id === roomId);
  const { data: membersData } = useQuery<{ roomMembers: RoomMemberRow[] }>(
    ROOM_MEMBERS_QUERY,
    { variables: { roomId }, skip: !roomId },
  );
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  useEffect(() => {
    if (!membersData) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMembers(
      membersData.roomMembers.map((member) =>
        member.user.id === user?.id ? { ...member, isOnline: true } : member,
      ),
    );
  }, [membersData, user?.id]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
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
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="font-medium"># {room?.name ?? "…"}</span>
        {room?.isPrivate && <Badge variant="secondary">Private</Badge>}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto">
              {members.length} member{members.length === 1 ? "" : "s"}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle># {room?.name ?? "…"} members</DialogTitle>
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
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      </div>
      <ScrollArea className="flex-1 px-4">
        <div className="mx-auto max-w-full space-y-3 py-4">
          {loading && !historyLoaded && (
            <p className="text-muted-foreground">Loading messages…</p>
          )}
          {orderedMessages.length === 0 && historyLoaded && (
            <p className="text-muted-foreground">
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
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message…"
          maxLength={2000}
          className="flex-1"
        />
        <Button type="submit">Send</Button>
      </form>
    </div>
  );
}
