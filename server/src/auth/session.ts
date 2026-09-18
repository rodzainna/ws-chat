import type { Request, Response } from "express";
import { issueToken } from "./jwt.js";
import { generateRefreshToken } from "./refreshToken.js";
import {
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
} from "./cookies.js";
import {
  createRefreshTokenRecord,
  findRefreshTokenByPlaintext,
  claimRefreshTokenForRotation,
  revokeAllRefreshTokensForUser,
} from "../db/refreshTokens.js";
import { findActiveUserById } from "../db/users.js";
import type { User } from "../generated/prisma/client.js";

// shared by register and login. Sequential on purpose: signing first means a
// signing failure can't leave an orphaned refresh_token row behind.
export async function establishSession(
  userId: string,
  res: Response,
): Promise<void> {
  const accessToken = await issueToken(userId);
  const refreshToken = generateRefreshToken();
  await createRefreshTokenRecord(userId, refreshToken);
  setAuthCookies(res, { accessToken, refreshToken });
}

export type RefreshOutcome = { ok: true; user: User } | { ok: false };

export async function rotateSession(
  req: Request,
  res: Response,
): Promise<RefreshOutcome> {
  const plaintextToken: unknown = req.cookies[REFRESH_TOKEN_COOKIE];
  if (typeof plaintextToken !== "string") {
    return { ok: false };
  }

  const row = await findRefreshTokenByPlaintext(plaintextToken);
  if (!row) {
    clearAuthCookies(res);
    return { ok: false };
  }

  if (row.revokedAt) {
    await revokeAllRefreshTokensForUser(row.userId);
    clearAuthCookies(res);
    return { ok: false };
  }

  if (row.expiresAt <= new Date()) {
    clearAuthCookies(res);
    return { ok: false };
  }

  const user = await findActiveUserById(row.userId);
  if (!user) {
    clearAuthCookies(res);
    return { ok: false };
  }

  const accessToken = await issueToken(user.id);

  const claimed = await claimRefreshTokenForRotation(row.id);
  if (!claimed) {
    clearAuthCookies(res);
    return { ok: false };
  }

  const refreshToken = generateRefreshToken();
  await createRefreshTokenRecord(user.id, refreshToken);
  setAuthCookies(res, { accessToken, refreshToken });

  return { ok: true, user };
}
