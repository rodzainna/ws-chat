let cachedMaxAttempts: number | undefined;
function getMaxAttempts(): number {
  if (cachedMaxAttempts === undefined) {
    const raw = process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS;
    const parsed = raw === undefined ? 5 : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `LOGIN_RATE_LIMIT_MAX_ATTEMPTS must be a positive number, got "${raw}"`,
      );
    }
    cachedMaxAttempts = parsed;
  }
  return cachedMaxAttempts;
}

let cachedWindowMs: number | undefined;
function getWindowMs(): number {
  if (cachedWindowMs === undefined) {
    const raw = process.env.LOGIN_RATE_LIMIT_WINDOW_SECONDS;
    const parsed = raw === undefined ? 900 : Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(
        `LOGIN_RATE_LIMIT_WINDOW_SECONDS must be a positive number, got "${raw}"`,
      );
    }
    cachedWindowMs = parsed * 1000;
  }
  return cachedWindowMs;
}

type Bucket = { count: number; windowStart: number };

function checkAndRecord(
  store: Map<string, Bucket>,
  key: string,
  now: number,
): boolean {
  const bucket = store.get(key);
  if (!bucket || now - bucket.windowStart > getWindowMs()) {
    store.set(key, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > getMaxAttempts();
}

const attemptsByUsername = new Map<string, Bucket>();
const attemptsByIp = new Map<string, Bucket>();

export function isLoginRateLimited(username: string, ip: string): boolean {
  const now = Date.now();
  const usernameLimited = checkAndRecord(
    attemptsByUsername,
    username.toLowerCase(),
    now,
  );
  const ipLimited = checkAndRecord(attemptsByIp, ip, now);
  return usernameLimited || ipLimited;
}
