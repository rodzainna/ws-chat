import { getPrisma } from "./prisma.js";
import { hashToken, type IssuedRefreshToken } from "../auth/refreshToken.js";

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
