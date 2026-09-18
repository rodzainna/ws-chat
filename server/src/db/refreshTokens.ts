import { getPrisma } from "./prisma.js";
import { hashToken, type IssuedRefreshToken } from "../auth/refreshToken.js";
import type { RefreshToken } from "../generated/prisma/client.js";

export async function createRefreshTokenRecord(
  userId: string,
  refreshToken: IssuedRefreshToken,
): Promise<void> {
  await getPrisma().refreshToken.create({
    data: {
      userId,
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt,
    },
  });
}

export async function revokeRefreshToken(
  plaintextToken: string,
): Promise<void> {
  await getPrisma().refreshToken.updateMany({
    where: { tokenHash: hashToken(plaintextToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function findRefreshTokenByPlaintext(
  plaintextToken: string,
): Promise<RefreshToken | null> {
  return getPrisma().refreshToken.findUnique({
    where: { tokenHash: hashToken(plaintextToken) },
  });
}

export async function claimRefreshTokenForRotation(
  id: string,
): Promise<boolean> {
  const { count } = await getPrisma().refreshToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count === 1;
}

export async function revokeAllRefreshTokensForUser(
  userId: string,
): Promise<void> {
  await getPrisma().refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
