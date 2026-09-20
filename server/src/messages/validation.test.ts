import { describe, it, expect } from "vitest";
import { validateMessageContent, MAX_CONTENT_LENGTH } from "./validation.js";

describe("validateMessageContent", () => {
  it("accepts ordinary content", () => {
    expect(validateMessageContent("hello room")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(validateMessageContent("")).not.toBeNull();
  });

  it("rejects whitespace-only content", () => {
    expect(validateMessageContent("   \n\t  ")).not.toBeNull();
  });

  it("accepts content at exactly the length cap", () => {
    expect(validateMessageContent("a".repeat(MAX_CONTENT_LENGTH))).toBeNull();
  });

  it("rejects content over the length cap", () => {
    expect(
      validateMessageContent("a".repeat(MAX_CONTENT_LENGTH + 1)),
    ).not.toBeNull();
  });

  it("counts the cap against trimmed length, not raw length", () => {
    const padded = `  ${"a".repeat(MAX_CONTENT_LENGTH)}  `;
    expect(validateMessageContent(padded)).toBeNull();
  });
});
