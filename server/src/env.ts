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

let cachedSuperAdminUsername: string | null | undefined;
export function getSuperAdminUsername(): string | null {
  if (cachedSuperAdminUsername === undefined) {
    const raw = process.env.SUPERADMIN_USERNAME;
    cachedSuperAdminUsername = raw ? raw.trim().toLowerCase() : null;
  }
  return cachedSuperAdminUsername;
}
