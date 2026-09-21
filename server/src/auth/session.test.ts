import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

const issueToken = vi.fn();
vi.mock("./jwt.js", () => ({ issueToken }));

const generateRefreshToken = vi.fn();
vi.mock("./refreshToken.js", () => ({ generateRefreshToken }));

const setAuthCookies = vi.fn();
const clearAuthCookies = vi.fn();
const REFRESH_TOKEN_COOKIE = "refresh_token";
vi.mock("./cookies.js", () => ({
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_COOKIE,
}));

const findRefreshTokenByPlaintext = vi.fn();
const rotateRefreshToken = vi.fn();
const revokeAllRefreshTokensForUser = vi.fn();
const createRefreshTokenRecord = vi.fn();
vi.mock("../db/refreshTokens.js", () => ({
  findRefreshTokenByPlaintext,
  rotateRefreshToken,
  revokeAllRefreshTokensForUser,
  createRefreshTokenRecord,
}));

const findUserById = vi.fn();
vi.mock("../db/users.js", () => ({ findUserById }));

const { rotateSession } = await import("./session.js");

function fakeReq(cookieValue: string | undefined): Request {
  return { cookies: { [REFRESH_TOKEN_COOKIE]: cookieValue } } as never;
}
const fakeRes = {} as Response;

const NEW_TOKEN = {
  plaintextToken: "new-plaintext",
  tokenHash: "new-hash",
  expiresAt: new Date("2099-01-01"),
};

function makeTokenRow(overrides: { revokedAt: Date | null; expiresAt?: Date }) {
  return {
    id: "row-1",
    userId: "user-1",
    expiresAt: new Date("2099-01-01"),
    ...overrides,
  };
}

describe("rotateSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    findRefreshTokenByPlaintext.mockReset();
    rotateRefreshToken.mockReset();
    revokeAllRefreshTokensForUser.mockReset();
    findUserById.mockReset();
    issueToken.mockReset();
    generateRefreshToken.mockReset().mockReturnValue(NEW_TOKEN);
    setAuthCookies.mockReset();
    clearAuthCookies.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fails without touching the database when there is no refresh cookie", async () => {
    const result = await rotateSession(fakeReq(undefined), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(findRefreshTokenByPlaintext).not.toHaveBeenCalled();
  });

  it("clears cookies when the presented token matches no row", async () => {
    findRefreshTokenByPlaintext.mockResolvedValue(null);

    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(clearAuthCookies).toHaveBeenCalledWith(fakeRes);
  });

  it("treats reuse within the grace window as a benign race, not theft", async () => {
    findRefreshTokenByPlaintext.mockResolvedValue(
      makeTokenRow({ revokedAt: new Date("2026-01-01T00:00:00Z") }),
    );

    vi.setSystemTime(new Date("2026-01-01T00:00:05Z"));
    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(revokeAllRefreshTokensForUser).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it("revokes every session for the user on reuse well outside the grace window", async () => {
    findRefreshTokenByPlaintext.mockResolvedValue(
      makeTokenRow({ revokedAt: new Date("2026-01-01T00:00:00Z") }),
    );

    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(revokeAllRefreshTokensForUser).toHaveBeenCalledWith("user-1");
    expect(clearAuthCookies).toHaveBeenCalledWith(fakeRes);
  });

  it("clears cookies when the token has expired", async () => {
    findRefreshTokenByPlaintext.mockResolvedValue(
      makeTokenRow({ revokedAt: null, expiresAt: new Date("2020-01-01") }),
    );

    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(clearAuthCookies).toHaveBeenCalledWith(fakeRes);
  });

  it("clears cookies when the token's user no longer exists", async () => {
    findRefreshTokenByPlaintext.mockResolvedValue(
      makeTokenRow({ revokedAt: null }),
    );
    findUserById.mockResolvedValue(null);

    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(clearAuthCookies).toHaveBeenCalledWith(fakeRes);
  });

  it("fails without clearing cookies when the account is deactivated", async () => {
    findRefreshTokenByPlaintext.mockResolvedValue(
      makeTokenRow({ revokedAt: null }),
    );
    findUserById.mockResolvedValue({ id: "user-1", isActive: false });

    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(clearAuthCookies).not.toHaveBeenCalled();
    expect(setAuthCookies).not.toHaveBeenCalled();
  });

  it("rotates successfully for a valid, live token", async () => {
    const user = { id: "user-1", isActive: true };
    findRefreshTokenByPlaintext.mockResolvedValue(
      makeTokenRow({ revokedAt: null }),
    );
    findUserById.mockResolvedValue(user);
    const accessTokenExpiresAt = new Date("2026-01-01T00:15:00Z");
    issueToken.mockResolvedValue({
      token: "access-token",
      expiresAt: accessTokenExpiresAt,
    });
    rotateRefreshToken.mockResolvedValue(true);

    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: true, user, accessTokenExpiresAt });
    expect(setAuthCookies).toHaveBeenCalledWith(fakeRes, {
      accessToken: "access-token",
      refreshToken: NEW_TOKEN,
    });
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });

  it("leaves cookies untouched when it loses the rotation race to a concurrent request", async () => {
    findRefreshTokenByPlaintext.mockResolvedValue(
      makeTokenRow({ revokedAt: null }),
    );
    findUserById.mockResolvedValue({ id: "user-1", isActive: true });
    issueToken.mockResolvedValue({
      token: "access-token",
      expiresAt: new Date("2026-01-01T00:15:00Z"),
    });
    rotateRefreshToken.mockResolvedValue(false);

    const result = await rotateSession(fakeReq("token"), fakeRes);

    expect(result).toEqual({ ok: false });
    expect(setAuthCookies).not.toHaveBeenCalled();
    expect(clearAuthCookies).not.toHaveBeenCalled();
  });
});
