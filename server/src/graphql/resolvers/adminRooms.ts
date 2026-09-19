import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { findRoomsPage } from "../../db/rooms.js";
import type { GraphQLContext } from "../context.js";
import { encodeCursor, decodeCursor } from "../cursor.js";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export async function adminRooms(
  _parent: unknown,
  { first, after }: { first?: number | null; after?: string | null },
  context: GraphQLContext,
) {
  const caller = await requireActiveUser(context);

  if (caller.globalRole !== "ADMIN") {
    throw new GraphQLError("Only an admin can list all rooms", {
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

  const rows = await findRoomsPage({
    take: pageSize + 1,
    afterId,
    callerId: caller.id,
  });
  const hasNextPage = rows.length > pageSize;
  const page = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    edges: page.map((room) => ({
      cursor: encodeCursor(room.id),
      node: { ...room, isMember: room.members.length > 0 },
    })),
    pageInfo: {
      hasNextPage,
      endCursor:
        page.length > 0 ? encodeCursor(page[page.length - 1].id) : null,
    },
  };
}
