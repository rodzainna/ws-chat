import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { canAccessRoom } from "../../db/rooms.js";
import { findMessagesPage } from "../../db/messages.js";
import type { Message } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

type MessageConnection = {
  edges: { cursor: string; node: Message }[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
};

function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

function decodeCursor(cursor: string): string {
  const decoded = Buffer.from(cursor, "base64url").toString("utf8");
  if (!decoded) {
    throw new GraphQLError("Invalid cursor", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return decoded;
}

export async function messages(
  _parent: unknown,
  {
    roomId,
    first,
    after,
  }: { roomId: string; first?: number | null; after?: string | null },
  context: GraphQLContext,
): Promise<MessageConnection> {
  const user = await requireActiveUser(context);

  const allowed = await canAccessRoom(user.id, roomId);
  if (!allowed) {
    throw new GraphQLError("You are not a member of this room", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const requestedFirst = first ?? DEFAULT_PAGE_SIZE;
  if (requestedFirst <= 0) {
    throw new GraphQLError("first must be a positive integer", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  const pageSize = Math.min(requestedFirst, MAX_PAGE_SIZE);
  const afterId = after ? decodeCursor(after) : undefined;

  const rows = await findMessagesPage({
    roomId,
    take: pageSize + 1,
    afterId,
  });
  const hasNextPage = rows.length > pageSize;
  const page = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    edges: page.map((message) => ({
      cursor: encodeCursor(message.id),
      node: message,
    })),
    pageInfo: {
      hasNextPage,
      endCursor:
        page.length > 0 ? encodeCursor(page[page.length - 1].id) : null,
    },
  };
}
