import { getPositiveIntEnv } from "../env.js";

// keyed by username AND ip: username-only lets anyone lock out an account,
// ip-only lets one attacker spray many usernames. Only failures count.

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

function recordFailure(
  store: Map<string, Bucket>,
  key: string,
  now: number,
): void {
  const bucket = store.get(key);
  if (!bucket || now - bucket.windowStart > getWindowMs()) {
    store.set(key, { count: 1, windowStart: now });
  } else {
    bucket.count += 1;
  }
}

const attemptsByUsername = new Map<string, Bucket>();
const attemptsByIp = new Map<string, Bucket>();

export function isLoginRateLimited(username: string, ip: string): boolean {
  const now = Date.now();
  return (
    isLimited(attemptsByUsername, username.toLowerCase(), now) ||
    isLimited(attemptsByIp, ip, now)
  );
}

export function recordFailedLoginAttempt(username: string, ip: string): void {
  const now = Date.now();
  recordFailure(attemptsByUsername, username.toLowerCase(), now);
  recordFailure(attemptsByIp, ip, now);
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
