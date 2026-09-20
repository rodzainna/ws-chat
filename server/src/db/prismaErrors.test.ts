import { describe, it, expect } from "vitest";
import {
  isUniqueConstraintViolation,
  getViolatedUniqueField,
} from "./prismaErrors.js";
import { Prisma } from "../generated/prisma/client.js";

function makeP2002(index: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { driverAdapterError: { cause: { constraint: { index } } } },
  });
}

describe("isUniqueConstraintViolation", () => {
  it("recognizes a P2002 error", () => {
    expect(isUniqueConstraintViolation(makeP2002("users_username_key"))).toBe(
      true,
    );
  });

  it("rejects a Prisma error with a different code", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(isUniqueConstraintViolation(err)).toBe(false);
  });

  it("rejects a plain, non-Prisma error", () => {
    expect(isUniqueConstraintViolation(new Error("boom"))).toBe(false);
  });

  it("rejects a non-error value", () => {
    expect(isUniqueConstraintViolation("not an error")).toBe(false);
  });
});

describe("getViolatedUniqueField", () => {
  it.each([
    ["users_username_key", "username"],
    ["users_email_key", "email"],
    ["rooms_name_key", "name"],
  ])(
    "identifies %s as the %s constraint from the driver adapter's index name",
    (index, field) => {
      expect(getViolatedUniqueField(makeP2002(index))).toBe(field);
    },
  );

  it("returns null for an unrecognized constraint index", () => {
    expect(getViolatedUniqueField(makeP2002("some_other_key"))).toBeNull();
  });

  it("returns null when meta is missing entirely", () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test" },
    );
    expect(getViolatedUniqueField(err)).toBeNull();
  });

  it("returns null for a non-P2002 error", () => {
    const err = new Prisma.PrismaClientKnownRequestError("Not found", {
      code: "P2025",
      clientVersion: "test",
    });
    expect(getViolatedUniqueField(err)).toBeNull();
  });
});
