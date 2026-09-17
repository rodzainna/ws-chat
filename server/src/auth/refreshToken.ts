import { randomBytes, createHash } from "node:crypto";
import { getPositiveIntEnv } from "../env.js";

const TOKEN_BYTES = 32;

let cachedExpiryDays: number | undefined;
function getExpiryDays(): number {
  if (cachedExpiryDays === undefined) {
    cachedExpiryDays = getPositiveIntEnv("JWT_REFRESH_TOKEN_EXPIRY_DAYS", 3);
  }
  return cachedExpiryDays;
}

export type IssuedRefreshToken = {
  plaintextToken: string;
  tokenHash: string;
  expiresAt: Date;
};

// SHA-256, not bcrypt: 256 random bits can't be guessed anyway. Only the
// hash is stored.
export function generateRefreshToken(): IssuedRefreshToken {
  const plaintextToken = randomBytes(TOKEN_BYTES).toString("base64url");
  const expiresAt = new Date(
    Date.now() + getExpiryDays() * 24 * 60 * 60 * 1000,
  );
  return { plaintextToken, tokenHash: hashToken(plaintextToken), expiresAt };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
