import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphQLContext } from "../context.js";

const verifyPassword = vi.fn();
const hashPassword = vi.fn();
vi.mock("../../auth/password.js", () => ({ verifyPassword, hashPassword }));

const establishSession = vi.fn();
vi.mock("../../auth/session.js", () => ({ establishSession }));

const reserveLoginAttempt = vi.fn();
const releaseLoginAttempt = vi.fn();
vi.mock("../../auth/loginRateLimit.js", () => ({
  reserveLoginAttempt,
  releaseLoginAttempt,
}));

const findUserByUsername = vi.fn();
vi.mock("../../db/users.js", () => ({ findUserByUsername }));

const { login } = await import("./login.js");

const DUMMY_HASH = "dummy-hash";
const fakeRes = { name: "fake-res" };
const context = {
  req: { ip: "1.1.1.1" },
  res: fakeRes,
} as unknown as GraphQLContext;

describe("login", () => {
  beforeEach(() => {
    verifyPassword.mockReset().mockResolvedValue(false);
    hashPassword.mockReset().mockResolvedValue(DUMMY_HASH);
    reserveLoginAttempt.mockReset().mockReturnValue(false);
    releaseLoginAttempt.mockReset();
    findUserByUsername.mockReset();
    establishSession.mockReset();
  });

  it("rejects with a rate-limit error before ever looking up the user", async () => {
    reserveLoginAttempt.mockReturnValue(true);

    const result = await login(
      null,
      { input: { username: "alice", password: "pw" } },
      context,
    );

    expect(result.userErrors).toEqual([
      {
        field: [],
        message: "Too many login attempts. Please try again later.",
      },
    ]);
    expect(findUserByUsername).not.toHaveBeenCalled();
  });

  it("gives a generic error for an unknown username, still paying the bcrypt cost", async () => {
    findUserByUsername.mockResolvedValue(null);

    const result = await login(
      null,
      { input: { username: "ghost", password: "pw" } },
      context,
    );

    expect(result.userErrors).toEqual([
      { field: [], message: "Invalid username or password" },
    ]);
    expect(verifyPassword).toHaveBeenCalledWith("pw", DUMMY_HASH);
  });

  it("gives the same generic error for a wrong password", async () => {
    findUserByUsername.mockResolvedValue({
      id: "u1",
      passwordHash: "real-hash",
      isActive: true,
    });
    verifyPassword.mockResolvedValue(false);

    const result = await login(
      null,
      { input: { username: "alice", password: "wrong" } },
      context,
    );

    expect(result.userErrors).toEqual([
      { field: [], message: "Invalid username or password" },
    ]);
  });

  it("gives the same generic error for a deactivated account, not a distinct message", async () => {
    findUserByUsername.mockResolvedValue({
      id: "u1",
      passwordHash: "real-hash",
      isActive: false,
    });
    verifyPassword.mockResolvedValue(true);

    const result = await login(
      null,
      { input: { username: "alice", password: "correct" } },
      context,
    );

    expect(result.userErrors).toEqual([
      { field: [], message: "Invalid username or password" },
    ]);
    expect(establishSession).not.toHaveBeenCalled();
  });

  it("establishes a session and releases the rate-limit reservation on success", async () => {
    const user = { id: "u1", passwordHash: "real-hash", isActive: true };
    findUserByUsername.mockResolvedValue(user);
    verifyPassword.mockResolvedValue(true);
    const accessTokenExpiresAt = new Date("2099-01-01");
    establishSession.mockResolvedValue({ accessTokenExpiresAt });

    const result = await login(
      null,
      { input: { username: "alice", password: "correct" } },
      context,
    );

    expect(result).toEqual({ user, accessTokenExpiresAt, userErrors: [] });
    expect(releaseLoginAttempt).toHaveBeenCalledWith("alice", "1.1.1.1");
    expect(establishSession).toHaveBeenCalledWith("u1", context.res);
  });
});
