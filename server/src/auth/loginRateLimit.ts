import { getPositiveIntEnv } from "../env.js";

// keyed by username AND ip: username-only lets anyone lock out an account,
// ip-only lets one attacker spray many usernames. Only failures count.
//
// Attempts are reserved synchronously before any await, so concurrent
// requests can't all read the same count; a successful login releases its
// reservation.

let cachedMaxAttempts: number | undefined;
function getMaxAttempts(): number {
  cachedMaxAttempts ??= getPositiveIntEnv("LOGIN_RATE_LIMIT_MAX_ATTEMPTS", 5);
  return cachedMaxAttempts;
}

let cachedWindowMs: number | undefined;
function getWindowMs(): number {
  cachedWindowMs ??=
    getPositiveIntEnv("LOGIN_RATE_LIMIT_WINDOW_SECONDS", 900) * 1000;
  return cachedWindowMs;
}

type Bucket = { count: number; windowStart: number };

function isLimited(
  store: Map<string, Bucket>,
  key: string,
  now: number,
): boolean {
  const bucket = store.get(key);
  if (!bucket || now - bucket.windowStart > getWindowMs()) return false;
  return bucket.count >= getMaxAttempts();
}

function increment(store: Map<string, Bucket>, key: string, now: number): void {
  const bucket = store.get(key);
  if (!bucket || now - bucket.windowStart > getWindowMs()) {
    store.set(key, { count: 1, windowStart: now });
  } else {
    bucket.count += 1;
  }
}

function release(store: Map<string, Bucket>, key: string, now: number): void {
  const bucket = store.get(key);
  if (!bucket || now - bucket.windowStart > getWindowMs()) return;
  bucket.count = Math.max(0, bucket.count - 1);
}

const attemptsByUsername = new Map<string, Bucket>();
const attemptsByIp = new Map<string, Bucket>();

export function reserveLoginAttempt(
  username: string,
  ip: string | undefined,
): boolean {
  const now = Date.now();
  const usernameKey = username.toLowerCase();

  if (isLimited(attemptsByUsername, usernameKey, now)) return true;
  if (ip && isLimited(attemptsByIp, ip, now)) return true;

  increment(attemptsByUsername, usernameKey, now);
  if (ip) increment(attemptsByIp, ip, now);
  return false;
}

export function releaseLoginAttempt(
  username: string,
  ip: string | undefined,
): void {
  const now = Date.now();
  release(attemptsByUsername, username.toLowerCase(), now);
  if (ip) release(attemptsByIp, ip, now);
}

function sweepExpiredBuckets(store: Map<string, Bucket>, now: number): void {
  for (const [key, bucket] of store) {
    if (now - bucket.windowStart > getWindowMs()) {
      store.delete(key);
    }
  }
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  sweepExpiredBuckets(attemptsByUsername, now);
  sweepExpiredBuckets(attemptsByIp, now);
}, SWEEP_INTERVAL_MS).unref();
