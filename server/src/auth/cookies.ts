import type { Response } from "express";
import { getAccessTokenExpiryMs } from "./jwt.js";
import type { IssuedRefreshToken } from "./refreshToken.js";

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

const isSecureCookie = process.env.NODE_ENV !== "development";

export function setAuthCookies(
  res: Response,
  {
    accessToken,
    refreshToken,
  }: { accessToken: string; refreshToken: IssuedRefreshToken },
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isSecureCookie,
    sameSite: "lax",
    path: "/",
    maxAge: getAccessTokenExpiryMs(),
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken.plaintextToken, {
    httpOnly: true,
    secure: isSecureCookie,
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
