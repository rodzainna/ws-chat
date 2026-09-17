import { findUserById } from "../db/users.js";
import type { User } from "../generated/prisma/client.js";
import type { GraphQLContext } from "./context.js";

export async function getCurrentActiveUser(
  context: GraphQLContext,
): Promise<User | null> {
  if (!context.userId) return null;
  const user = await findUserById(context.userId);
  if (!user || !user.isActive) return null;
  return user;
}
