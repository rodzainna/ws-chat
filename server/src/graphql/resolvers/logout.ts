import { clearAuthCookies, REFRESH_TOKEN_COOKIE } from "../../auth/cookies.js";
import {
  findRefreshTokenByPlaintext,
  revokeSession,
} from "../../db/refreshTokens.js";
import type { GraphQLContext } from "../context.js";

// logs out this browser only (all its tabs), not the user's other devices
export async function logout(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
): Promise<{ success: boolean }> {
  const refreshTokenCookie: unknown = context.req.cookies[REFRESH_TOKEN_COOKIE];
  if (typeof refreshTokenCookie === "string") {
    const row = await findRefreshTokenByPlaintext(refreshTokenCookie);
    if (row) {
      await revokeSession(row.sessionId);
      context.connectionRegistry.disconnectSession(
        row.userId,
        row.sessionId,
        "logged_out",
      );
    }
  }
  clearAuthCookies(context.res);
  return { success: true };
}
