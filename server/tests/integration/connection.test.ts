import { describe, it, expect } from "vitest";
import { setupIntegrationTest } from "./fixtures.js";
import { registerUser, connectSocket } from "./testClient.js";

describe("WS connection auth", () => {
  const ctx = setupIntegrationTest();

  it("accepts an upgrade carrying a valid access token cookie", async () => {
    const alice = await registerUser(ctx.server.baseUrl, "alice");
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    socket.close();
  });

  it("rejects an upgrade with no cookie at all", async () => {
    await expect(connectSocket(ctx.server.wsUrl, "")).rejects.toThrow();
  });

  it("rejects an upgrade with a garbage access token", async () => {
    await expect(
      connectSocket(ctx.server.wsUrl, "access_token=not-a-real-token"),
    ).rejects.toThrow();
  });
});
