export type Room = { id: string; name: string; isPrivate: boolean };

export type ChatMessage = {
  id: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  mentionedUsernames: string[];
};

export type MessagesQueryData = {
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
    pageInfo: { hasPreviousPage: boolean; startCursor: string | null };
  };
};

export function edgeToChatMessage(
  edge: MessagesQueryData["messages"]["edges"][number],
): ChatMessage {
  const { node } = edge;
  return {
    id: node.id,
    userId: node.userId,
    username: node.username,
    content: node.content,
    createdAt: node.createdAt,
    editedAt: node.editedAt,
    deleted: node.deletedAt !== null,
    mentionedUsernames: node.mentionedUsernames,
  };
}

export type RoomMemberRow = {
  user: { id: string; username: string };
  role: "OWNER" | "MEMBER";
  isOnline: boolean;
};

export type SuggestionItem = { id: string; username: string };

export function formatMessageTimestamp(iso: string): string {
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
