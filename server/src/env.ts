export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export function getPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  if (!/^\d+(\.\d+)?$/.test(raw.trim())) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  const parsed = Number(raw);
  if (parsed <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return parsed;
}
