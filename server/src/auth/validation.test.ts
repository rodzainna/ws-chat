import { describe, it, expect } from "vitest";
import {
  validateUsername,
  validateEmail,
  validatePassword,
} from "./validation.js";
import { MAX_PASSWORD_BYTES } from "./password.js";

describe("validateUsername", () => {
  it("accepts a valid username", () => {
    expect(validateUsername("alice_99")).toBeNull();
  });

  it.each(["ab", "a".repeat(21), "Alice!", "has space", ""])(
    "rejects %j",
    (username) => {
      expect(validateUsername(username)).not.toBeNull();
    },
  );

  it("is case-insensitive about the character set (uppercase letters are fine, only the charset outside a-z0-9_ is not)", () => {
    expect(validateUsername("Alice99")).toBeNull();
  });
});

describe("validateEmail", () => {
  it("accepts a plausible email", () => {
    expect(validateEmail("alice@example.com")).toBeNull();
  });

  it.each([
    "not-an-email",
    "missing@domain",
    "@no-local.com",
    "spaces in@it.com",
  ])("rejects %j", (email) => {
    expect(validateEmail(email)).not.toBeNull();
  });
});

describe("validatePassword", () => {
  it("accepts a password at the minimum length", () => {
    expect(validatePassword("12345678")).toBeNull();
  });

  it("rejects a password under the minimum length", () => {
    expect(validatePassword("1234567")).not.toBeNull();
  });

  it("rejects a password over bcrypt's byte limit", () => {
    expect(validatePassword("a".repeat(MAX_PASSWORD_BYTES + 1))).not.toBeNull();
  });

  it("accepts a password exactly at bcrypt's byte limit", () => {
    expect(validatePassword("a".repeat(MAX_PASSWORD_BYTES))).toBeNull();
  });
});
