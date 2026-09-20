import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestServer, type TestServer } from "./testServer.js";
import { truncateAllTables } from "./testDb.js";
import { registerUser, connectSocket } from "./testClient.js";

describe("WS connection auth", () => {
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

  it("accepts an upgrade carrying a valid access token cookie", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const socket = await connectSocket(server.wsUrl, alice.cookies);
    socket.close();
  });

  it("rejects an upgrade with no cookie at all", async () => {
    await expect(connectSocket(server.wsUrl, "")).rejects.toThrow();
  });

  it("rejects an upgrade with a garbage access token", async () => {
    await expect(
      connectSocket(server.wsUrl, "access_token=not-a-real-token"),
    ).rejects.toThrow();
  });
});
