import { describe, it, expect } from "vitest";
import { extractMentionedUsernames } from "./mentions.js";

describe("extractMentionedUsernames", () => {
  it("extracts a single mention", () => {
    expect(extractMentionedUsernames("hey @alice, look at this")).toEqual([
      "alice",
    ]);
  });

  it("extracts multiple distinct mentions", () => {
    expect(extractMentionedUsernames("@alice and @bob, thoughts?")).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("dedupes repeated mentions of the same user", () => {
    expect(extractMentionedUsernames("@alice @alice @alice")).toEqual([
      "alice",
    ]);
  });

  it("lowercases mentions so casing doesn't create duplicates", () => {
    expect(extractMentionedUsernames("@Alice and @ALICE")).toEqual(["alice"]);
  });

  it("does not treat an email address as a mention", () => {
    expect(extractMentionedUsernames("reach me at foo@johndoe.com")).toEqual(
      [],
    );
  });

  it("ignores an @ with no valid username after it", () => {
    expect(extractMentionedUsernames("just an @ symbol")).toEqual([]);
  });

  it("ignores a candidate shorter than the minimum username length", () => {
    expect(extractMentionedUsernames("@ab is too short")).toEqual([]);
  });

  it("stops a mention at a word boundary rather than over-matching", () => {
    expect(extractMentionedUsernames("@alice_smith, hi")).toEqual([
      "alice_smith",
    ]);
  });

  it("returns an empty array when there are no mentions", () => {
    expect(extractMentionedUsernames("no mentions here")).toEqual([]);
  });
});
