import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { findUserById, deactivateUserByIdGuarded } from "../../db/users.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";

type DeactivateUserPayload = {
  user: User | null;
  userErrors: GraphQLUserError[];
};

export async function deactivateUser(
  _parent: unknown,
  { userId }: { userId: string },
  context: GraphQLContext,
): Promise<DeactivateUserPayload> {
  const caller = await requireActiveUser(context);

  if (caller.globalRole !== "ADMIN") {
    throw new GraphQLError("Only an admin can deactivate a user", {
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
  if (!preCheck.isActive) {
    return {
      user: null,
      userErrors: [
        { field: ["userId"], message: "User is already deactivated" },
      ],
    };
  }

  const { blocked, user } = await deactivateUserByIdGuarded(userId);

  if (blocked) {
    return {
      user: null,
      userErrors: [
        {
          field: ["userId"],
          message: "Cannot deactivate the last active admin",
        },
      ],
    };
  }
  if (!user) {
    return {
      user: null,
      userErrors: [{ field: ["userId"], message: "User not found" }],
    };
  }

  return { user, userErrors: [] };
}
