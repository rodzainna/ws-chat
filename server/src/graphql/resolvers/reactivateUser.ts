import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { findUserById, reactivateUserById } from "../../db/users.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";

type ReactivateUserPayload = {
  user: User | null;
  userErrors: GraphQLUserError[];
};

export async function reactivateUser(
  _parent: unknown,
  { userId }: { userId: string },
  context: GraphQLContext,
): Promise<ReactivateUserPayload> {
  const caller = await requireActiveUser(context);

  if (caller.globalRole !== "ADMIN") {
    throw new GraphQLError("Only an admin can reactivate a user", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const preCheck = await findUserById(userId);
  if (!preCheck) {
    return {
      user: null,
      userErrors: [{ field: ["userId"], message: "User not found" }],
    };
  }
  if (preCheck.isActive) {
    return {
      user: null,
      userErrors: [{ field: ["userId"], message: "User is already active" }],
    };
  }

  const user = await reactivateUserById(userId);

  return { user, userErrors: [] };
}
