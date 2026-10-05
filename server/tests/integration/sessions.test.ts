import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { SignJWT } from "jose";
import { Client } from "pg";
import { setupIntegrationTest } from "./fixtures.js";
import { TEST_JWT_SECRET } from "./testServer.js";
import { TEST_DATABASE_URL } from "./testDb.js";
import {
  registerUsers,
  loginUser,
  logout,
  refreshSucceeds,
  connectSocket,
  graphqlRequest,
  type TestUser,
} from "./testClient.js";

const ME = `{ me { username } }`;

function withoutCookie(cookies: string, name: string): string {
  return cookies
    .split("; ")
    .filter((c) => !c.startsWith(`${name}=`))
    .join("; ");
}

describe("per-browser sessions", () => {
  const ctx = setupIntegrationTest();

  it("logout without a refresh cookie still ends the access token's session", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);

    await logout(ctx.server.baseUrl, {
      ...alice,
      cookies: withoutCookie(alice.cookies, "refresh_token"),
    });

    await socket.waitFor((m) => m.type === "session_expired");
    expect(await refreshSucceeds(ctx.server.baseUrl, alice)).toBe(false);
  });

  it("logout waits for an in-flight refresh and revokes its new token", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const tab = await loginUser(ctx.server.baseUrl, "alice");
    const db = new Client({ connectionString: TEST_DATABASE_URL });
    await db.connect();

    // a refresh mid-rotation: holds the session lock, new token not committed
    const { rows } = await db.query<{ sessionId: string }>(
      `SELECT "sessionId" FROM refresh_tokens
       WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [alice.id],
    );
    const sessionId = rows[0].sessionId;
    const rotatedToken = "rotated-during-logout";
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [sessionId]);
    await db.query(
      `INSERT INTO refresh_tokens (id, "userId", "sessionId", "tokenHash", "expiresAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, now() + interval '1 day')`,
      [
        alice.id,
        sessionId,
        createHash("sha256").update(rotatedToken).digest("hex"),
      ],
    );

    const loggingOut = logout(ctx.server.baseUrl, tab);
    await new Promise((resolve) => setTimeout(resolve, 200));
    await db.query("COMMIT");
    await loggingOut;
    await db.end();

    const rotated: TestUser = {
      ...tab,
      cookies: `refresh_token=${rotatedToken}`,
    };
    expect(await refreshSucceeds(ctx.server.baseUrl, rotated)).toBe(false);
  });

  it("still accepts an access token issued before sessions existed", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const legacyToken = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(alice.id)
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(TEST_JWT_SECRET));
    const cookies = `access_token=${legacyToken}`;

    const me = await graphqlRequest<{ me: { username: string } | null }>(
      ctx.server.baseUrl,
      ME,
      {},
      cookies,
    );
    expect(me.data?.me?.username).toBe("alice");

    const socket = await connectSocket(ctx.server.wsUrl, cookies);
    socket.close();
  });
});
