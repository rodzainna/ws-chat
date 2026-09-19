import ms from "ms";
import { SignJWT, jwtVerify, errors, type JWTPayload } from "jose";

const ALGORITHM = "HS256";
const MIN_SECRET_BYTES = 32;

let cachedSecret: Uint8Array | undefined;
function getSecret(): Uint8Array {
  if (!cachedSecret) {
    const raw = process.env.JWT_SECRET;
    if (!raw) {
      throw new Error("JWT_SECRET environment variable is not set");
    }
    const encoded = new TextEncoder().encode(raw);
    if (encoded.length < MIN_SECRET_BYTES) {
      throw new Error(
        `JWT_SECRET must be at least ${MIN_SECRET_BYTES} bytes for HS256`,
      );
    }
    cachedSecret = encoded;
  }
  return cachedSecret;
}

// setTimeout's max delay; anything larger fires after 1ms. The WS expiry
// timer schedules off this value.
const MAX_EXPIRY_MS = 2_147_483_647;

let cachedExpiryMs: number | undefined;
export function getAccessTokenExpiryMs(): number {
  if (cachedExpiryMs === undefined) {
    const raw = process.env.JWT_ACCESS_TOKEN_EXPIRY ?? "15m";
    // ms() reads a bare "15" as milliseconds; require a unit
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      throw new Error(
        `JWT_ACCESS_TOKEN_EXPIRY must include a unit (e.g. "15m", "1h") — a bare number like "${raw}" is parsed as milliseconds, not what was likely intended`,
      );
    }
    const parsed = raw === "" ? undefined : ms(raw as ms.StringValue);
    if (typeof parsed !== "number" || parsed <= 0) {
      throw new Error(
        `JWT_ACCESS_TOKEN_EXPIRY is not a valid duration: "${raw}"`,
      );
    }
    if (parsed > MAX_EXPIRY_MS) {
      throw new Error(
        `JWT_ACCESS_TOKEN_EXPIRY is too long: "${raw}" exceeds the maximum supported duration (~24.8 days)`,
      );
    }
    cachedExpiryMs = parsed;
  }
  return cachedExpiryMs;
}

export function issueToken(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + getAccessTokenExpiryMs());
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(getSecret());
}

async function verifyAndDecode(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALGORITHM],
    });
    return payload;
  } catch (err) {
    if (err instanceof errors.JOSEError) {
      return null;
    }
    throw err;
  }
}

export async function verifyToken(token: string): Promise<string | null> {
  const payload = await verifyAndDecode(token);
  return payload && typeof payload.sub === "string" ? payload.sub : null;
}

export async function verifyTokenWithExpiry(
  token: string,
): Promise<{ userId: string; expiresAt: number } | null> {
  const payload = await verifyAndDecode(token);
  if (
    !payload ||
    typeof payload.sub !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }
  return { userId: payload.sub, expiresAt: payload.exp * 1000 };
}
