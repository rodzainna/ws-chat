import { getPrisma } from "./prisma.js";
import type { IssuedRefreshToken } from "../auth/refreshToken.js";

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
