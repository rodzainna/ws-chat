import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  tryConsumeRegistrationToken,
  limitKey,
} from "./registrationRateLimit.js";

// the defaults: 10 sign-ups per hour
const CAPACITY = 10;

function drain(ip: string | undefined) {
  for (let i = 0; i < CAPACITY; i++) tryConsumeRegistrationToken(ip);
}

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
    drain("10.0.0.2");
    expect(tryConsumeRegistrationToken("10.0.0.2")).toBe(false);
    expect(tryConsumeRegistrationToken("10.0.0.3")).toBe(true);
  });

  it("allows sign-ups again after the window", () => {
    drain("10.0.0.4");
    vi.setSystemTime(3_600_000);
    expect(tryConsumeRegistrationToken("10.0.0.4")).toBe(true);
  });

  it("shares one bucket across an IPv6 /64", () => {
    drain("2001:db8:1:2::1");
    expect(tryConsumeRegistrationToken("2001:db8:1:2::ffff")).toBe(false);
    expect(tryConsumeRegistrationToken("2001:db8:1:3::1")).toBe(true);
  });

  it("still limits requests with no IP", () => {
    drain(undefined);
    expect(tryConsumeRegistrationToken(undefined)).toBe(false);
  });
});

describe("limitKey", () => {
  it("groups IPv6 addresses by /64, however they're written", () => {
    expect(limitKey("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(limitKey("2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd")).toBe(
      "2001:db8:1:2::/64",
    );
    expect(limitKey("::1")).toBe("0:0:0:0::/64");
  });

  it("treats IPv4-mapped IPv6 as plain IPv4", () => {
    expect(limitKey("::ffff:10.0.0.1")).toBe("10.0.0.1");
  });
});
