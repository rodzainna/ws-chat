import { getPrisma } from "./prisma.js";
import { hashToken, type IssuedRefreshToken } from "../auth/refreshToken.js";
import type { Prisma, RefreshToken } from "../generated/prisma/client.js";

// serializes rotation and logout for one session, so a logout can't miss a
// token that a concurrent refresh is about to commit
async function lockSession(tx: Prisma.TransactionClient, sessionId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`;
}

// one session per login; rotation keeps the same sessionId
export async function createRefreshTokenRecord(
  userId: string,
  sessionId: string,
  refreshToken: IssuedRefreshToken,
): Promise<void> {
  await getPrisma().refreshToken.create({
    data: {
      userId,
      sessionId,
      tokenHash: refreshToken.tokenHash,
      expiresAt: refreshToken.expiresAt,
    },
  });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await getPrisma().$transaction(async (tx) => {
    await lockSession(tx, sessionId);
    await tx.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
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
    await lockSession(tx, oldToken.sessionId);
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
