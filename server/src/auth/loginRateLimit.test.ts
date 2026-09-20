import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { reserveLoginAttempt, releaseLoginAttempt } from "./loginRateLimit.js";

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 900_000;

describe("reserveLoginAttempt / releaseLoginAttempt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows attempts up to the limit, then blocks", () => {
    const username = "alice-a";
    const ip = "1.1.1.1";
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      expect(reserveLoginAttempt(username, ip)).toBe(false);
    }
    expect(reserveLoginAttempt(username, ip)).toBe(true);
  });

  it("keeps separate limits per username", () => {
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      reserveLoginAttempt("alice-b", undefined);
    }
    expect(reserveLoginAttempt("alice-b", undefined)).toBe(true);
    expect(reserveLoginAttempt("bob-b", undefined)).toBe(false);
  });

  it("is case-insensitive on username so alice/Alice share one bucket", () => {
    const ip = "1.1.1.4";
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      reserveLoginAttempt(i % 2 === 0 ? "alice-c" : "Alice-C", ip);
    }
    expect(reserveLoginAttempt("ALICE-c", ip)).toBe(true);
  });

  it("also rate-limits by IP across different usernames", () => {
    const ip = "2.2.2.2";
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      reserveLoginAttempt(`user-${i}`, ip);
    }
    expect(reserveLoginAttempt("someone-else", ip)).toBe(true);
  });

  it("does not rate-limit by IP when no IP is provided", () => {
    for (let i = 0; i < MAX_ATTEMPTS * 3; i++) {
      reserveLoginAttempt(`no-ip-user-${i}`, undefined);
    }
    expect(reserveLoginAttempt("no-ip-user-final", undefined)).toBe(false);
  });

  it("releasing a reservation frees up a slot for that username again", () => {
    const username = "alice-d";
    const ip = "1.1.1.5";
    for (let i = 0; i < MAX_ATTEMPTS; i++) reserveLoginAttempt(username, ip);
    expect(reserveLoginAttempt(username, ip)).toBe(true);

    releaseLoginAttempt(username, ip);
    expect(reserveLoginAttempt(username, ip)).toBe(false);
  });

  it("resets once the fixed window has fully elapsed", () => {
    const username = "alice-e";
    const ip = "1.1.1.6";
    for (let i = 0; i < MAX_ATTEMPTS; i++) reserveLoginAttempt(username, ip);
    expect(reserveLoginAttempt(username, ip)).toBe(true);

    vi.setSystemTime(WINDOW_MS + 1);
    expect(reserveLoginAttempt(username, ip)).toBe(false);
  });
});
