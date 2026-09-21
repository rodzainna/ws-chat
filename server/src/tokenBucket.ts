import { getPositiveIntEnv } from "./env.js";

type Bucket = { tokens: number; lastRefill: number };

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export function createTokenBucketLimiter(options: {
  capacityEnvVar: string;
  defaultCapacity: number;
  windowSecondsEnvVar: string;
  defaultWindowSeconds: number;
}): { tryConsume: (key: string) => boolean } {
  let cachedCapacity: number | undefined;
  function getCapacity(): number {
    cachedCapacity ??= getPositiveIntEnv(
      options.capacityEnvVar,
      options.defaultCapacity,
    );
    return cachedCapacity;
  }

  let cachedWindowMs: number | undefined;
  function getWindowMs(): number {
    cachedWindowMs ??=
      getPositiveIntEnv(
        options.windowSecondsEnvVar,
        options.defaultWindowSeconds,
      ) * 1000;
    return cachedWindowMs;
  }

  let cachedRefillRate: number | undefined;
  function getRefillRate(): number {
    cachedRefillRate ??= getCapacity() / getWindowMs();
    return cachedRefillRate;
  }

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

  function tryConsume(key: string): boolean {
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: getCapacity(), lastRefill: now };
      buckets.set(key, bucket);
    } else {
      refill(bucket, now);
    }

    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  function sweepIdleBuckets(now: number): void {
    const windowMs = getWindowMs();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill >= windowMs) {
        buckets.delete(key);
      }
    }
  }

  setInterval(() => {
    // a bad env value thrown here would crash the process; nothing else
    // catches errors in a timer
    try {
      sweepIdleBuckets(Date.now());
    } catch (err) {
      console.error(`${options.capacityEnvVar} bucket sweep failed:`, err);
    }
  }, SWEEP_INTERVAL_MS).unref();

  return { tryConsume };
}
