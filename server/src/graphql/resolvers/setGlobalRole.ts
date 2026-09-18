import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findUserById,
  countActiveAdmins,
  updateGlobalRole,
} from "../../db/users.js";
import type { GlobalRole, User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";

type SetGlobalRolePayload = {
  user: User | null;
  userErrors: GraphQLUserError[];
};

const USER_NOT_FOUND: GraphQLUserError = {
  field: ["userId"],
  message: "User not found",
};

export async function setGlobalRole(
  _parent: unknown,
  { userId, role }: { userId: string; role: GlobalRole },
  context: GraphQLContext,
): Promise<SetGlobalRolePayload> {
  const caller = await requireActiveUser(context);

  if (caller.globalRole !== "ADMIN") {
    throw new GraphQLError("Only an admin can change a user's role", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const target = await findUserById(userId);
  if (!target) {
    return { user: null, userErrors: [USER_NOT_FOUND] };
  }

  if (target.globalRole === "ADMIN" && target.isActive && role !== "ADMIN") {
    const activeAdmins = await countActiveAdmins();
    if (activeAdmins <= 1) {
      return {
        user: null,
        userErrors: [
          {
            field: ["role"],
            message: "Cannot change the last active admin's role",
          },
        ],
      };
    }
  }

  const updated = await updateGlobalRole(userId, role);
  return { user: updated, userErrors: [] };
}
