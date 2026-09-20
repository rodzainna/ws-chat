import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestServer, type TestServer } from "./testServer.js";
import { truncateAllTables, promoteToAdmin } from "./testDb.js";
import {
  registerUser,
  deactivateUser,
  logout,
  connectSocket,
} from "./testClient.js";

describe("force-disconnect on deactivation and logout", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(async () => {
    await truncateAllTables();
  });

  it("closes a deactivated user's live socket with a session_expired frame", async () => {
    const admin = await registerUser(server.baseUrl, "admin");
    await promoteToAdmin(admin.id);
    const alice = await registerUser(server.baseUrl, "alice");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);

    await deactivateUser(server.baseUrl, admin, alice.id);

    const expired = await aliceSocket.waitFor(
      (m) => m.type === "session_expired",
    );
    expect(expired).toEqual({ type: "session_expired", reason: "deactivated" });
  });

  it("closes every open socket for a user across multiple tabs/devices on deactivation", async () => {
    const admin = await registerUser(server.baseUrl, "admin");
    await promoteToAdmin(admin.id);
    const alice = await registerUser(server.baseUrl, "alice");

    const tabOne = await connectSocket(server.wsUrl, alice.cookies);
    const tabTwo = await connectSocket(server.wsUrl, alice.cookies);

    await deactivateUser(server.baseUrl, admin, alice.id);

    await tabOne.waitFor((m) => m.type === "session_expired");
    await tabTwo.waitFor((m) => m.type === "session_expired");
  });

  it("closes a live socket with a session_expired frame on logout", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const socket = await connectSocket(server.wsUrl, alice.cookies);

    await logout(server.baseUrl, alice);

    const expired = await socket.waitFor((m) => m.type === "session_expired");
    expect(expired).toEqual({ type: "session_expired", reason: "logged_out" });
  });

  it("doesn't disconnect an unrelated user's socket when someone else is deactivated", async () => {
    const admin = await registerUser(server.baseUrl, "admin");
    await promoteToAdmin(admin.id);
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");

    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);

    await deactivateUser(server.baseUrl, admin, alice.id);

    await bobSocket.assertNoneWithin((m) => m.type === "session_expired");

    bobSocket.close();
  });
});
