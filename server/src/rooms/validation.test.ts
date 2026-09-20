import { describe, it, expect } from "vitest";
import { validateRoomName } from "./validation.js";

describe("validateRoomName", () => {
  it("accepts a name in range", () => {
    expect(validateRoomName("general")).toBeNull();
  });

  it("rejects a name under the minimum length", () => {
    expect(validateRoomName("ab")).not.toBeNull();
  });

  it("rejects a name over the maximum length", () => {
    expect(validateRoomName("a".repeat(51))).not.toBeNull();
  });

  it("accepts a name at exactly the minimum and maximum length", () => {
    expect(validateRoomName("abc")).toBeNull();
    expect(validateRoomName("a".repeat(50))).toBeNull();
  });

  it("checks trimmed length, not raw length", () => {
    expect(validateRoomName("  ab  ")).not.toBeNull();
    expect(validateRoomName("  abc  ")).toBeNull();
  });
});
