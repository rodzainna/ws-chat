import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { updateGlobalRoleGuarded } from "../../db/users.js";
import type { GlobalRole, User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";

type SetGlobalRolePayload = {
  user: User | null;
  userErrors: GraphQLUserError[];
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

  const result = await updateGlobalRoleGuarded(userId, role);

  if (result.blocked) {
    return {
      user: null,
      userErrors: [
        {
          field: ["role"],
          message:
            result.reason === "superadmin"
              ? "This account's role cannot be changed"
              : "Cannot change the last active admin's role",
        },
      ],
    };
  }
  const { user } = result;
  if (!user) {
    return {
      user: null,
      userErrors: [{ field: ["userId"], message: "User not found" }],
    };
  }

  return { user, userErrors: [] };
}
