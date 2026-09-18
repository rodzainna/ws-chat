import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findUserById,
  isLastActiveAdmin,
  deactivateUserById,
} from "../../db/users.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";

type DeactivateUserPayload = {
  user: User | null;
  userErrors: GraphQLUserError[];
};

const USER_NOT_FOUND: GraphQLUserError = {
  field: ["userId"],
  message: "User not found",
};

const ALREADY_DEACTIVATED: GraphQLUserError = {
  field: ["userId"],
  message: "User is already deactivated",
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

  const target = await findUserById(userId);
  if (!target) {
    return { user: null, userErrors: [USER_NOT_FOUND] };
  }
  if (!target.isActive) {
    return { user: null, userErrors: [ALREADY_DEACTIVATED] };
  }

  if (await isLastActiveAdmin(target)) {
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

  const updated = await deactivateUserById(userId);
  return { user: updated, userErrors: [] };
}
