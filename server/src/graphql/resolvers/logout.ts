import { clearAuthCookies, REFRESH_TOKEN_COOKIE } from "../../auth/cookies.js";
import { revokeRefreshToken } from "../../db/refreshTokens.js";
import type { GraphQLContext } from "../context.js";

export async function logout(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
): Promise<{ success: boolean }> {
  const refreshTokenCookie: unknown = context.req.cookies[REFRESH_TOKEN_COOKIE];
  if (typeof refreshTokenCookie === "string") {
    await revokeRefreshToken(refreshTokenCookie);
  }
  clearAuthCookies(context.res);
  return { success: true };
}
