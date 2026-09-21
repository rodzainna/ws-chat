import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { canAccessRoom } from "../../db/rooms.js";
import { findMessagesPage, type MessageWithAuthor } from "../../db/messages.js";
import type { GraphQLContext } from "../context.js";
import { encodeCursor, decodeCursor } from "../cursor.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 50;

type MessageConnection = {
  edges: { cursor: string; node: MessageWithAuthor }[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
    hasPreviousPage: boolean;
    startCursor: string | null;
  };
};

export async function messages(
  _parent: unknown,
  {
    roomId,
    last,
    before,
  }: { roomId: string; last?: number | null; before?: string | null },
  context: GraphQLContext,
): Promise<MessageConnection> {
  const user = await requireActiveUser(context);

  const allowed = await canAccessRoom(user.id, roomId);
  if (!allowed) {
    throw new GraphQLError("You are not a member of this room", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const requestedLast = last ?? DEFAULT_PAGE_SIZE;
  if (requestedLast <= 0) {
    throw new GraphQLError("last must be a positive integer", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  const pageSize = Math.min(requestedLast, MAX_PAGE_SIZE);
  const beforeId = before ? decodeCursor(before) : undefined;

  const rows = await findMessagesPage({
    roomId,
    take: pageSize + 1,
    beforeId,
  });
  const hasPreviousPage = rows.length > pageSize;
  const page = hasPreviousPage ? rows.slice(1) : rows;

  return {
    edges: page.map((message) => ({
      cursor: encodeCursor(message.id),
      node: message,
    })),
    pageInfo: {
      hasNextPage: false,
      endCursor: null,
      hasPreviousPage,
      startCursor: page.length > 0 ? encodeCursor(page[0].id) : null,
    },
  };
}
