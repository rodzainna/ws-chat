import { describe, it, expect } from "vitest";
import { setupIntegrationTest } from "./fixtures.js";
import {
  registerUsers,
  createRoom,
  addRoomMember,
  connectSocket,
  joinRoomOverSocket,
} from "./testClient.js";

describe("presence", () => {
  const ctx = setupIntegrationTest();

  it("notifies a room's other members when someone comes online, room-wide not just in a joined room", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(aliceSocket, room.id);

    const bobSocket = await connectSocket(ctx.server.wsUrl, bob.cookies);

    const presenceEvent = await aliceSocket.waitFor(
      (m) => m.type === "presence_changed" && m.userId === bob.id,
    );
    expect(presenceEvent).toEqual({
      type: "presence_changed",
      userId: bob.id,
      online: true,
    });

    aliceSocket.close();
    bobSocket.close();
  });

  it("notifies a room's other members when someone goes offline", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(aliceSocket, room.id);

    const bobSocket = await connectSocket(ctx.server.wsUrl, bob.cookies);
    await aliceSocket.waitFor(
      (m) =>
        m.type === "presence_changed" &&
        m.userId === bob.id &&
        m.online === true,
    );

    bobSocket.close();

    const offlineEvent = await aliceSocket.waitFor(
      (m) =>
        m.type === "presence_changed" &&
        m.userId === bob.id &&
        m.online === false,
    );
    expect(offlineEvent).toEqual({
      type: "presence_changed",
      userId: bob.id,
      online: false,
    });

    aliceSocket.close();
  });

  it("doesn't report someone offline while they still have another tab/device connected", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(aliceSocket, room.id);

    const bobTabOne = await connectSocket(ctx.server.wsUrl, bob.cookies);
    await aliceSocket.waitFor(
      (m) =>
        m.type === "presence_changed" &&
        m.userId === bob.id &&
        m.online === true,
    );
    const bobTabTwo = await connectSocket(ctx.server.wsUrl, bob.cookies);

    bobTabOne.close();
    await aliceSocket.assertNoneWithin(
      (m) =>
        m.type === "presence_changed" &&
        m.userId === bob.id &&
        m.online === false,
    );

    aliceSocket.close();
    bobTabTwo.close();
  });
});
