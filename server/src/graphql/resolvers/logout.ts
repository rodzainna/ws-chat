import { clearAuthCookies, REFRESH_TOKEN_COOKIE } from "../../auth/cookies.js";
import {
  findRefreshTokenByPlaintext,
  revokeRefreshToken,
} from "../../db/refreshTokens.js";
import type { GraphQLContext } from "../context.js";

export async function logout(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
): Promise<{ success: boolean }> {
  const refreshTokenCookie: unknown = context.req.cookies[REFRESH_TOKEN_COOKIE];
  if (typeof refreshTokenCookie === "string") {
    const row = await findRefreshTokenByPlaintext(refreshTokenCookie);
    await revokeRefreshToken(refreshTokenCookie);
    if (row) {
      context.connectionRegistry.disconnectUser(row.userId, "logged_out");
    }
  }
  clearAuthCookies(context.res);
  return { success: true };
}
