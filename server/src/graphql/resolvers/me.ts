import { findUserById } from "../../db/users.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";

export function me(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
): Promise<User | null> {
  if (!context.userId) return Promise.resolve(null);
  return findUserById(context.userId);
}
