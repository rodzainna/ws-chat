import bcrypt from "bcrypt";

const SALT_ROUNDS = 12;
// bcrypt ignores bytes past 72; validation.ts rejects longer passwords
export const MAX_PASSWORD_BYTES = 72;

export async function hashPassword(plain: string): Promise<string> {
  if (Buffer.byteLength(plain, "utf8") > MAX_PASSWORD_BYTES) {
    throw new Error(
      `Password exceeds bcrypt's ${MAX_PASSWORD_BYTES}-byte limit`,
    );
  }
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
