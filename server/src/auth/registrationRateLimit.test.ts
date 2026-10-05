import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { tryConsumeRegistrationToken } from "./registrationRateLimit.js";

// the defaults: 5 sign-ups per hour
const CAPACITY = 5;

describe("tryConsumeRegistrationToken", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects once an IP has used its sign-ups", () => {
    for (let i = 0; i < CAPACITY; i++) {
      expect(tryConsumeRegistrationToken("10.0.0.1")).toBe(true);
    }
    expect(tryConsumeRegistrationToken("10.0.0.1")).toBe(false);
  });

  it("keeps separate buckets per IP", () => {
    for (let i = 0; i < CAPACITY; i++) tryConsumeRegistrationToken("10.0.0.2");
    expect(tryConsumeRegistrationToken("10.0.0.2")).toBe(false);
    expect(tryConsumeRegistrationToken("10.0.0.3")).toBe(true);
  });

  it("allows sign-ups again after the window", () => {
    for (let i = 0; i < CAPACITY; i++) tryConsumeRegistrationToken("10.0.0.4");
    vi.setSystemTime(3_600_000);
    expect(tryConsumeRegistrationToken("10.0.0.4")).toBe(true);
  });
});
