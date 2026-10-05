import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphQLContext } from "../context.js";

const hashPassword = vi.fn();
vi.mock("../../auth/password.js", () => ({
  hashPassword,
  MAX_PASSWORD_BYTES: 72,
}));

const establishSession = vi.fn();
vi.mock("../../auth/session.js", () => ({ establishSession }));

const tryConsumeRegistrationToken = vi.fn();
vi.mock("../../auth/registrationRateLimit.js", () => ({
  tryConsumeRegistrationToken,
}));

const countUsers = vi.fn();
const createUser = vi.fn();
vi.mock("../../db/users.js", () => ({ countUsers, createUser }));

const { register } = await import("./register.js");

const context = {
  req: { ip: "1.1.1.1" },
  res: {},
} as unknown as GraphQLContext;
const input = {
  username: "alice",
  email: "alice@example.com",
  password: "testpass123",
};

describe("register", () => {
  beforeEach(() => {
    hashPassword.mockReset().mockResolvedValue("hash");
    establishSession.mockReset().mockResolvedValue({
      accessTokenExpiresAt: new Date(),
    });
    tryConsumeRegistrationToken.mockReset().mockReturnValue(true);
    countUsers.mockReset().mockResolvedValue(0);
    createUser.mockReset().mockResolvedValue({ id: "u1" });
  });

  it("closes registration once the user cap is reached", async () => {
    countUsers.mockResolvedValue(500);

    const result = await register(null, { input }, context);

    expect(result.userErrors[0].message).toMatch(/Registration is closed/);
    expect(tryConsumeRegistrationToken).not.toHaveBeenCalled();
    expect(createUser).not.toHaveBeenCalled();
  });

  it("rejects a rate-limited IP before hashing the password", async () => {
    tryConsumeRegistrationToken.mockReturnValue(false);

    const result = await register(null, { input }, context);

    expect(result.userErrors[0].message).toMatch(/Too many sign-ups/);
    expect(tryConsumeRegistrationToken).toHaveBeenCalledWith("1.1.1.1");
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it("charges a token even for invalid input", async () => {
    const result = await register(
      null,
      { input: { ...input, username: "x" } },
      context,
    );

    expect(result.user).toBeNull();
    expect(tryConsumeRegistrationToken).toHaveBeenCalled();
  });

  it("registers when under the cap and the limit", async () => {
    const result = await register(null, { input }, context);

    expect(result.userErrors).toEqual([]);
    expect(createUser).toHaveBeenCalled();
  });
});
