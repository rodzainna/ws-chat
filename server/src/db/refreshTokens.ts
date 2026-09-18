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

export async function rotateRefreshToken(
  oldTokenId: string,
  userId: string,
  newToken: IssuedRefreshToken,
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: oldTokenId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) return false;

    await tx.refreshToken.create({
      data: {
        userId,
        tokenHash: newToken.tokenHash,
        expiresAt: newToken.expiresAt,
      },
    });
    return true;
  });
}

export async function revokeAllRefreshTokensForUser(
  userId: string,
): Promise<void> {
  await getPrisma().refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
