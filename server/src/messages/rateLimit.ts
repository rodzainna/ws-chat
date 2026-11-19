import { createTokenBucketLimiter } from "../lib/tokenBucket.js";

const limiter = createTokenBucketLimiter({
  capacityEnvVar: "RATE_LIMIT_MAX_MESSAGES",
  defaultCapacity: 10,
  windowSecondsEnvVar: "RATE_LIMIT_WINDOW_SECONDS",
  defaultWindowSeconds: 10,
});

export function tryConsumeMessageToken(userId: string): boolean {
  return limiter.tryConsume(userId);
}
