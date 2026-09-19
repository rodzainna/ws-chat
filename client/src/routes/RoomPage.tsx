import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { gql, useMutation, useQuery } from "@apollo/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [socketError, setSocketError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // sent-but-unconfirmed drafts, so a rate-limited send can be restored. FIFO
  // works because the server answers a socket's frames in order. (A second
  // tab in the same room can throw this off; accepted.)
  const pendingSendsRef = useRef<string[]>([]);

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
        if (message.userId === user?.id) {
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

  if (!roomId) return null;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="font-medium"># {room?.name ?? "…"}</span>
        {room?.isPrivate && <Badge variant="secondary">Private</Badge>}
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
                    <span className="font-medium">{message.username}</span>
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
                          <Button
                            type="button"
                            variant="linkMuted"
                            size="inline"
                            onClick={() =>
                              isOwn
                                ? deleteMessage(message.id)
                                : void handleAdminDelete(message.id)
                            }
                          >
                            Delete
                          </Button>
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
