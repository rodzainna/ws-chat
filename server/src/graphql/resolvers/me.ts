import { getCurrentActiveUser } from "../currentUser.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";

export function me(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
): Promise<User | null> {
  return getCurrentActiveUser(context);
}
