import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tryConsumeMessageToken } from "./rateLimit.js";

const CAPACITY = 10;
const WINDOW_MS = 10_000;

describe("tryConsumeMessageToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows a burst up to the bucket's full capacity", () => {
    const userId = "user-burst";
    for (let i = 0; i < CAPACITY; i++) {
      expect(tryConsumeMessageToken(userId)).toBe(true);
    }
  });

  it("rejects the request once the bucket is empty", () => {
    const userId = "user-exhausted";
    for (let i = 0; i < CAPACITY; i++) tryConsumeMessageToken(userId);
    expect(tryConsumeMessageToken(userId)).toBe(false);
  });

  it("keeps separate buckets per user", () => {
    const drained = "user-a";
    const fresh = "user-b";
    for (let i = 0; i < CAPACITY; i++) tryConsumeMessageToken(drained);
    expect(tryConsumeMessageToken(drained)).toBe(false);
    expect(tryConsumeMessageToken(fresh)).toBe(true);
  });

  it("refills partially, proportional to elapsed time", () => {
    const userId = "user-partial-refill";
    for (let i = 0; i < CAPACITY; i++) tryConsumeMessageToken(userId);
    expect(tryConsumeMessageToken(userId)).toBe(false);

    vi.setSystemTime(WINDOW_MS / 2);
    for (let i = 0; i < CAPACITY / 2; i++) {
      expect(tryConsumeMessageToken(userId)).toBe(true);
    }
    expect(tryConsumeMessageToken(userId)).toBe(false);
  });

  it("caps refill at full capacity even after a long idle period", () => {
    const userId = "user-long-idle";
    for (let i = 0; i < CAPACITY; i++) tryConsumeMessageToken(userId);

    vi.setSystemTime(WINDOW_MS * 100);
    for (let i = 0; i < CAPACITY; i++) {
      expect(tryConsumeMessageToken(userId)).toBe(true);
    }
    expect(tryConsumeMessageToken(userId)).toBe(false);
  });
});
