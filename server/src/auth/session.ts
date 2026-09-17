import type { Response } from "express";
import { issueToken } from "./jwt.js";
import { generateRefreshToken } from "./refreshToken.js";
import { setAuthCookies } from "./cookies.js";
import { createRefreshTokenRecord } from "../db/refreshTokens.js";

export async function establishSession(
  userId: string,
  res: Response,
): Promise<void> {
  const refreshToken = generateRefreshToken();
  const [accessToken] = await Promise.all([
    issueToken(userId),
    createRefreshTokenRecord(userId, refreshToken),
  ]);
  setAuthCookies(res, { accessToken, refreshToken });
}
