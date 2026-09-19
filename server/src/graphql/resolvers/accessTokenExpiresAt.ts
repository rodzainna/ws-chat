import type { GraphQLContext } from "../context.js";

export function accessTokenExpiresAt(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
): Date | null {
  return context.accessTokenExpiresAt;
}
