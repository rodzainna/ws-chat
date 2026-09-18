import { getPositiveIntEnv } from "../env.js";

let cachedCapacity: number | undefined;
function getCapacity(): number {
  cachedCapacity ??= getPositiveIntEnv("RATE_LIMIT_MAX_MESSAGES", 10);
  return cachedCapacity;
}

let cachedWindowMs: number | undefined;
function getWindowMs(): number {
  cachedWindowMs ??= getPositiveIntEnv("RATE_LIMIT_WINDOW_SECONDS", 10) * 1000;
  return cachedWindowMs;
}

let cachedRefillRate: number | undefined;
function getRefillRate(): number {
  cachedRefillRate ??= getCapacity() / getWindowMs();
  return cachedRefillRate;
}

getRefillRate();

type Bucket = { tokens: number; lastRefill: number };

const buckets = new Map<string, Bucket>();

function refill(bucket: Bucket, now: number): void {
  const elapsedMs = now - bucket.lastRefill;
  if (elapsedMs <= 0) return;
  bucket.tokens = Math.min(
    getCapacity(),
    bucket.tokens + elapsedMs * getRefillRate(),
  );
  bucket.lastRefill = now;
}

export function tryConsumeMessageToken(userId: string): boolean {
  const now = Date.now();
  let bucket = buckets.get(userId);
  if (!bucket) {
    bucket = { tokens: getCapacity(), lastRefill: now };
    buckets.set(userId, bucket);
  } else {
    refill(bucket, now);
  }

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function sweepIdleBuckets(now: number): void {
  const capacity = getCapacity();
  for (const [userId, bucket] of buckets) {
    refill(bucket, now);
    if (bucket.tokens >= capacity) {
      buckets.delete(userId);
    }
  }
}

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
setInterval(() => {
  sweepIdleBuckets(Date.now());
}, SWEEP_INTERVAL_MS).unref();
