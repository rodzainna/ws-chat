import { SignJWT, jwtVerify, errors } from "jose";

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

let cachedExpiry: string | undefined;
function getAccessTokenExpiry(): string {
  if (!cachedExpiry) {
    const raw = process.env.JWT_ACCESS_TOKEN_EXPIRY ?? "15m";
    new SignJWT({}).setExpirationTime(raw);
    cachedExpiry = raw;
  }
  return cachedExpiry;
}

export function issueToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(getAccessTokenExpiry())
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [ALGORITHM],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch (err) {
    if (err instanceof errors.JOSEError) {
      return null;
    }
    throw err;
  }
}
