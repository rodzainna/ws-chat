import { validateUsername } from "./auth/validation.js";

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

// plain positive integers only (Number() would accept "0x10" or "1.5");
// unset falls back to the default
export function getPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(`${name} must be a positive whole number, got "${raw}"`);
  }
  const parsed = Number(raw);
  if (parsed <= 0) {
    throw new Error(`${name} must be a positive whole number, got "${raw}"`);
  }
  return parsed;
}

let cachedMaxRooms: number | undefined;
export function getMaxRooms(): number {
  cachedMaxRooms ??= getPositiveIntEnv("MAX_ROOMS", 50);
  return cachedMaxRooms;
}

let cachedMaxUsers: number | undefined;
export function getMaxUsers(): number {
  cachedMaxUsers ??= getPositiveIntEnv("MAX_USERS", 500);
  return cachedMaxUsers;
}

let cachedSuperAdminUsername: string | null | undefined;
export function getSuperAdminUsername(): string | null {
  if (cachedSuperAdminUsername === undefined) {
    const raw = process.env.SUPERADMIN_USERNAME;
    if (raw === undefined) {
      cachedSuperAdminUsername = null;
    } else {
      const trimmed = raw.trim();
      const error = validateUsername(trimmed);
      if (error) {
        throw new Error(`SUPERADMIN_USERNAME is invalid: ${error.message}`);
      }
      cachedSuperAdminUsername = trimmed.toLowerCase();
    }
  }
  return cachedSuperAdminUsername;
}
