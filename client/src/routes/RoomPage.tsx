import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useParams } from "react-router";
import { gql, useQuery } from "@apollo/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/AuthContext";
import { useChatSocket, type WsChatMessage } from "@/ws/useChatSocket";
import { ROOMS_QUERY } from "@/components/RoomSidebar";

type Room = { id: string; name: string; isPrivate: boolean };

type ChatMessage = {
  id: string;
  userId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
};

const ROOM_MESSAGES_QUERY = gql`
  query RoomMessages($roomId: ID!) {
    messages(roomId: $roomId, first: 50) {
      edges {
        node {
          id
          userId
          content
          createdAt
          editedAt
          deletedAt
        }
      }
    }
  }
`;

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

  const { data, loading } = useQuery<{
    messages: {
      edges: {
        node: {
          id: string;
          userId: string;
          content: string;
          createdAt: string;
          editedAt: string | null;
          deletedAt: string | null;
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages(
      data.messages.edges.map(({ node }) => ({
        id: node.id,
        userId: node.userId,
        content: node.content,
        createdAt: node.createdAt,
        editedAt: node.editedAt,
        deleted: node.deletedAt !== null,
      })),
    );
    setHistoryLoaded(true);
  }, [data, historyLoaded]);

  const { sendMessage, editMessage, deleteMessage } = useChatSocket(
    roomId ?? "",
    {
      onCreated: (message: WsChatMessage) => {
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
      onError: (_code, message) => setSocketError(message),
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
    sendMessage(draft);
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

  if (!roomId) return null;

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="font-medium"># {room?.name ?? "…"}</span>
        {room?.isPrivate && <Badge variant="secondary">Private</Badge>}
      </div>
      <ScrollArea className="flex-1 px-4">
        <div className="mx-auto max-w-2xl space-y-3 py-4">
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
                {!isOwn && (
                  <span className="mb-1 px-1 text-xs font-medium text-muted-foreground">
                    {message.userId.slice(0, 8)}
                  </span>
                )}

                {isEditing ? (
                  <form
                    onSubmit={submitEdit}
                    className="flex w-full max-w-[70%] gap-2"
                  >
                    <Input
                      autoFocus
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                    />
                    <Button size="sm" type="submit">
                      Save
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <div
                    className={cn(
                      "max-w-[70%] rounded-2xl px-3 py-2",
                      isOwn ? "bg-primary text-primary-foreground" : "bg-muted",
                      message.deleted && "italic opacity-70",
                    )}
                  >
                    {message.content}
                  </div>
                )}

                <div className="mt-1 flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <span>
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </span>
                  {message.editedAt && !message.deleted && (
                    <span>(edited)</span>
                  )}
                  {isOwn && !message.deleted && !isEditing && (
                    <span className="hidden gap-1 group-hover:flex">
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => startEdit(message)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="hover:underline"
                        onClick={() => deleteMessage(message.id)}
                      >
                        Delete
                      </button>
                    </span>
                  )}
                </div>
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
