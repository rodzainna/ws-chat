import ms from "ms";
import type { Response } from "express";
import type { IssuedRefreshToken } from "./refreshToken.js";

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

const isProduction = process.env.NODE_ENV === "production";

let cachedAccessTokenMaxAgeMs: number | undefined;
function getAccessTokenMaxAgeMs(): number {
  if (cachedAccessTokenMaxAgeMs === undefined) {
    const raw = process.env.JWT_ACCESS_TOKEN_EXPIRY ?? "15m";
    const parsed = ms(raw as ms.StringValue);
    if (typeof parsed !== "number") {
      throw new Error(
        `JWT_ACCESS_TOKEN_EXPIRY is not a valid duration: "${raw}"`,
      );
    }
    cachedAccessTokenMaxAgeMs = parsed;
  }
  return cachedAccessTokenMaxAgeMs;
}

export function setAuthCookies(
  res: Response,
  {
    accessToken,
    refreshToken,
  }: { accessToken: string; refreshToken: IssuedRefreshToken },
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: getAccessTokenMaxAgeMs(),
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken.plaintextToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: refreshToken.expiresAt.getTime() - Date.now(),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/" });
}

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
