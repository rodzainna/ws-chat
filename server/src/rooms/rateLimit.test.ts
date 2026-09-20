import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tryConsumeRoomCreationToken } from "./rateLimit.js";

const CAPACITY = 5;
const WINDOW_MS = 300_000;

describe("tryConsumeRoomCreationToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to the bucket's full capacity", () => {
    const userId = "user-burst";
    for (let i = 0; i < CAPACITY; i++) {
      expect(tryConsumeRoomCreationToken(userId)).toBe(true);
    }
  });

  it("rejects once the bucket is empty", () => {
    const userId = "user-exhausted";
    for (let i = 0; i < CAPACITY; i++) tryConsumeRoomCreationToken(userId);
    expect(tryConsumeRoomCreationToken(userId)).toBe(false);
  });

  it("keeps separate buckets per user", () => {
    const drained = "user-a";
    const fresh = "user-b";
    for (let i = 0; i < CAPACITY; i++) tryConsumeRoomCreationToken(drained);
    expect(tryConsumeRoomCreationToken(drained)).toBe(false);
    expect(tryConsumeRoomCreationToken(fresh)).toBe(true);
  });

  it("refills fully after a full window has elapsed", () => {
    const userId = "user-refill";
    for (let i = 0; i < CAPACITY; i++) tryConsumeRoomCreationToken(userId);
    expect(tryConsumeRoomCreationToken(userId)).toBe(false);

    vi.setSystemTime(WINDOW_MS);
    for (let i = 0; i < CAPACITY; i++) {
      expect(tryConsumeRoomCreationToken(userId)).toBe(true);
    }
    expect(tryConsumeRoomCreationToken(userId)).toBe(false);
  });

  it("refills partially, proportional to elapsed time", () => {
    const userId = "user-partial-refill";
    for (let i = 0; i < CAPACITY; i++) tryConsumeRoomCreationToken(userId);
    expect(tryConsumeRoomCreationToken(userId)).toBe(false);

    vi.setSystemTime(WINDOW_MS / CAPACITY);
    expect(tryConsumeRoomCreationToken(userId)).toBe(true);
    expect(tryConsumeRoomCreationToken(userId)).toBe(false);
  });

  it("caps refill at full capacity even after a long idle period", () => {
    const userId = "user-long-idle";
    for (let i = 0; i < CAPACITY; i++) tryConsumeRoomCreationToken(userId);

    vi.setSystemTime(WINDOW_MS * 100);
    for (let i = 0; i < CAPACITY; i++) {
      expect(tryConsumeRoomCreationToken(userId)).toBe(true);
    }
    expect(tryConsumeRoomCreationToken(userId)).toBe(false);
  });
});
