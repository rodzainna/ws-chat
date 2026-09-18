import { rotateSession } from "../../auth/session.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";

type RefreshPayload = { user: User | null; userErrors: GraphQLUserError[] };

const SESSION_INVALID: GraphQLUserError = {
  field: [],
  message: "Session expired or invalid. Please log in again.",
};

export async function refresh(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
): Promise<RefreshPayload> {
  const outcome = await rotateSession(context.req, context.res);
  if (!outcome.ok) {
    return { user: null, userErrors: [SESSION_INVALID] };
  }
  return { user: outcome.user, userErrors: [] };
}
