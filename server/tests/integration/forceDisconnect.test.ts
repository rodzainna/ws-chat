import { describe, it, expect } from "vitest";
import { setupIntegrationTest } from "./fixtures.js";
import { promoteToAdmin } from "./testDb.js";
import {
  registerUsers,
  deactivateUser,
  loginUser,
  logout,
  refreshSucceeds,
  connectSocket,
} from "./testClient.js";

describe("force-disconnect on deactivation and logout", () => {
  const ctx = setupIntegrationTest();

  it("closes a deactivated user's live socket with a session_expired frame", async () => {
    const [admin, alice] = await registerUsers(ctx.server.baseUrl, [
      "admin",
      "alice",
    ]);
    await promoteToAdmin(admin.id);

    const aliceSocket = await connectSocket(ctx.server.wsUrl, alice.cookies);

    await deactivateUser(ctx.server.baseUrl, admin, alice.id);

    const expired = await aliceSocket.waitFor(
      (m) => m.type === "session_expired",
    );
    expect(expired).toEqual({ type: "session_expired", reason: "deactivated" });
  });

  it("closes every open socket for a user across multiple tabs/devices on deactivation", async () => {
    const [admin, alice] = await registerUsers(ctx.server.baseUrl, [
      "admin",
      "alice",
    ]);
    await promoteToAdmin(admin.id);

    const tabOne = await connectSocket(ctx.server.wsUrl, alice.cookies);
    const tabTwo = await connectSocket(ctx.server.wsUrl, alice.cookies);

    await deactivateUser(ctx.server.baseUrl, admin, alice.id);

    await tabOne.waitFor((m) => m.type === "session_expired");
    await tabTwo.waitFor((m) => m.type === "session_expired");
  });

  it("closes a live socket with a session_expired frame on logout", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);

    await logout(ctx.server.baseUrl, alice);

    const expired = await socket.waitFor((m) => m.type === "session_expired");
    expect(expired).toEqual({ type: "session_expired", reason: "logged_out" });
  });

  it("logout closes every tab of that browser but not the user's other devices", async () => {
    const [laptop] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const phone = await loginUser(ctx.server.baseUrl, "alice");

    const tabOne = await connectSocket(ctx.server.wsUrl, laptop.cookies);
    const tabTwo = await connectSocket(ctx.server.wsUrl, laptop.cookies);
    const phoneSocket = await connectSocket(ctx.server.wsUrl, phone.cookies);

    await logout(ctx.server.baseUrl, laptop);

    await tabOne.waitFor((m) => m.type === "session_expired");
    await tabTwo.waitFor((m) => m.type === "session_expired");
    await phoneSocket.assertNoneWithin((m) => m.type === "session_expired");

    expect(await refreshSucceeds(ctx.server.baseUrl, laptop)).toBe(false);
    expect(await refreshSucceeds(ctx.server.baseUrl, phone)).toBe(true);

    phoneSocket.close();
  });

  it("doesn't disconnect an unrelated user's socket when someone else is deactivated", async () => {
    const [admin, alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "admin",
      "alice",
      "bob",
    ]);
    await promoteToAdmin(admin.id);

    const bobSocket = await connectSocket(ctx.server.wsUrl, bob.cookies);

    await deactivateUser(ctx.server.baseUrl, admin, alice.id);

    await bobSocket.assertNoneWithin((m) => m.type === "session_expired");

    bobSocket.close();
  });
});
