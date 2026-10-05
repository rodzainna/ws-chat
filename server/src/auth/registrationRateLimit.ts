import { isIPv6 } from "node:net";
import { getPositiveIntEnv } from "../env.js";
import { createTokenBucketLimiter } from "../tokenBucket.js";

const CAPACITY_ENV = "RATE_LIMIT_MAX_REGISTRATIONS";
const DEFAULT_CAPACITY = 10;
const WINDOW_ENV = "RATE_LIMIT_REGISTRATION_WINDOW_SECONDS";
const DEFAULT_WINDOW_SECONDS = 3600;

// read at startup so a bad value fails the deploy, not every sign-up
getPositiveIntEnv(CAPACITY_ENV, DEFAULT_CAPACITY);
getPositiveIntEnv(WINDOW_ENV, DEFAULT_WINDOW_SECONDS);

const limiter = createTokenBucketLimiter({
  capacityEnvVar: CAPACITY_ENV,
  defaultCapacity: DEFAULT_CAPACITY,
  windowSecondsEnvVar: WINDOW_ENV,
  defaultWindowSeconds: DEFAULT_WINDOW_SECONDS,
});

// keyed by IP since there's no user yet
export function tryConsumeRegistrationToken(ip: string | undefined): boolean {
  return limiter.tryConsume(limitKey(ip));
}

// one IPv6 client usually owns a whole /64, so it shares one bucket; a
// missing IP shares a bucket too instead of skipping the limit
export function limitKey(ip: string | undefined): string {
  if (!ip) return "unknown";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!isIPv6(ip)) return ip;
  return `${expandIPv6(ip).slice(0, 4).join(":")}::/64`;
}

function expandIPv6(ip: string): string[] {
  const [head, tail = ""] = ip.split("%")[0].toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = ip.includes("::") ? 8 - left.length - right.length : 0;
  return [...left, ...Array<string>(missing).fill("0"), ...right].map((part) =>
    part.replace(/^0+(?=.)/, ""),
  );
}
