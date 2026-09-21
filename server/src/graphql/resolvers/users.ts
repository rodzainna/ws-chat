import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { findUsersPage, countUsers } from "../../db/users.js";
import type { GraphQLContext } from "../context.js";
import type { User } from "../../generated/prisma/client.js";
import { encodeCursor, decodeCursor } from "../cursor.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

type UserConnection = {
  edges: { cursor: string; node: User }[];
  pageInfo: {
    hasNextPage: boolean;
    endCursor: string | null;
    hasPreviousPage: boolean;
    startCursor: string | null;
  };
  totalCount: number;
};

export async function users(
  _parent: unknown,
  { first, after }: { first?: number | null; after?: string | null },
  context: GraphQLContext,
): Promise<UserConnection> {
  const caller = await requireActiveUser(context);

  if (caller.globalRole !== "ADMIN") {
    throw new GraphQLError("Only an admin can list users", {
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

  const [rows, totalCount] = await Promise.all([
    findUsersPage({ take: pageSize + 1, afterId }),
    countUsers(),
  ]);
  const hasNextPage = rows.length > pageSize;
  const page = hasNextPage ? rows.slice(0, pageSize) : rows;

  return {
    edges: page.map((user) => ({ cursor: encodeCursor(user.id), node: user })),
    pageInfo: {
      hasNextPage,
      endCursor:
        page.length > 0 ? encodeCursor(page[page.length - 1].id) : null,
      hasPreviousPage: false,
      startCursor: null,
    },
    totalCount,
  };
}
