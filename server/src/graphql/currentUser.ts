import { findActiveUserById } from "../db/users.js";
import type { User } from "../generated/prisma/client.js";
import type { GraphQLContext } from "./context.js";

export function getCurrentActiveUser(
  context: GraphQLContext,
): Promise<User | null> {
  if (!context.userId) return Promise.resolve(null);
  return findActiveUserById(context.userId);
}
