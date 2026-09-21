import { createTokenBucketLimiter } from "../tokenBucket.js";

const limiter = createTokenBucketLimiter({
  capacityEnvVar: "RATE_LIMIT_MAX_ROOM_CREATIONS",
  defaultCapacity: 5,
  windowSecondsEnvVar: "RATE_LIMIT_ROOM_CREATION_WINDOW_SECONDS",
  defaultWindowSeconds: 300,
});

export function tryConsumeRoomCreationToken(userId: string): boolean {
  return limiter.tryConsume(userId);
}
