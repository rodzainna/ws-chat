import type { Response } from "express";
import { isDevelopment } from "../env.js";
import { getAccessTokenExpiryMs } from "./jwt.js";
import type { IssuedRefreshToken } from "./refreshToken.js";

const ACCESS_TOKEN_COOKIE = "access_token";
const REFRESH_TOKEN_COOKIE = "refresh_token";

const isSecureCookie = !isDevelopment();

export function setAuthCookies(
  res: Response,
  {
    accessToken,
    refreshToken,
  }: { accessToken: string; refreshToken: IssuedRefreshToken },
): void {
  const cookieOptions = {
    httpOnly: true,
    secure: isSecureCookie,
    // frontend and API share one origin so Lax works; splitting hosts would
    // need None and reopen CSRF
    sameSite: "lax" as const,
    path: "/",
  };
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...cookieOptions,
    maxAge: getAccessTokenExpiryMs(),
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken.plaintextToken, {
    ...cookieOptions,
    maxAge: refreshToken.expiresAt.getTime() - Date.now(),
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: "/" });
}

export { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE };
