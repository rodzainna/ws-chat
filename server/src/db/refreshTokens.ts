import { randomUUID } from "node:crypto";
import { getPrisma } from "./prisma.js";
import { hashToken, type IssuedRefreshToken } from "../auth/refreshToken.js";
import type { RefreshToken } from "../generated/prisma/client.js";

// one session per login; rotation keeps the same sessionId
export async function createRefreshTokenRecord(
  userId: string,
  refreshToken: IssuedRefreshToken,
): Promise<string> {
  const sessionId = randomUUID();
  await getPrisma().refreshToken.create({
    data: {
      userId,
      sessionId,
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt,
    },
  });
  return sessionId;
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getPrisma().refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
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
  oldToken: Pick<RefreshToken, "id" | "userId" | "sessionId">,
  newToken: IssuedRefreshToken,
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: oldToken.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count !== 1) return false;

    await tx.refreshToken.create({
      data: {
        userId: oldToken.userId,
        sessionId: oldToken.sessionId,
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
