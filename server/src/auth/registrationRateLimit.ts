import { createTokenBucketLimiter } from "../tokenBucket.js";

const limiter = createTokenBucketLimiter({
  capacityEnvVar: "RATE_LIMIT_MAX_REGISTRATIONS",
  defaultCapacity: 5,
  windowSecondsEnvVar: "RATE_LIMIT_REGISTRATION_WINDOW_SECONDS",
  defaultWindowSeconds: 3600,
});

// keyed by IP since there's no user yet
export function tryConsumeRegistrationToken(ip: string | undefined): boolean {
  if (!ip) return true;
  return limiter.tryConsume(ip);
}
