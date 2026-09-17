import type { Response } from "express";
import { issueToken } from "./jwt.js";
import { generateRefreshToken } from "./refreshToken.js";
import { setAuthCookies } from "./cookies.js";
import { createRefreshTokenRecord } from "../db/refreshTokens.js";

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
