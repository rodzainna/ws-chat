import { GraphQLError } from "graphql";
import { findActiveUserById } from "../db/users.js";
import type { User } from "../generated/prisma/client.js";
import type { GraphQLContext } from "./context.js";

export function getCurrentActiveUser(
  context: GraphQLContext,
): Promise<User | null> {
  if (!context.userId) return Promise.resolve(null);
  return findActiveUserById(context.userId);
}

export async function requireActiveUser(
  context: GraphQLContext,
): Promise<User> {
  const user = await getCurrentActiveUser(context);
  if (!user) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "UNAUTHENTICATED" },
    });
  }
  return user;
}
