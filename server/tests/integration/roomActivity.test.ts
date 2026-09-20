import { describe, it, expect } from "vitest";
import {
  setupIntegrationTest,
  setUpRoomWithTwoJoinedMembers,
} from "./fixtures.js";
import {
  registerUsers,
  createRoom,
  addRoomMember,
  connectSocket,
  joinRoomOverSocket,
} from "./testClient.js";

describe("room_activity (unread/mention signal for rooms you're not viewing)", () => {
  const ctx = setupIntegrationTest();

  it("notifies a member whose socket is connected but not joined to the room", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(aliceSocket, room.id);

    const bobSocket = await connectSocket(ctx.server.wsUrl, bob.cookies);

    aliceSocket.send({ type: "send", roomId: room.id, content: "hello" });

    const activity = await bobSocket.waitFor((m) => m.type === "room_activity");
    expect(activity).toMatchObject({
      type: "room_activity",
      roomId: room.id,
      mentionsYou: false,
    });

    aliceSocket.close();
    bobSocket.close();
  });

  it("flags mentionsYou when the message @mentions that member", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(aliceSocket, room.id);
    const bobSocket = await connectSocket(ctx.server.wsUrl, bob.cookies);

    aliceSocket.send({ type: "send", roomId: room.id, content: "hey @bob" });

    const activity = await bobSocket.waitFor((m) => m.type === "room_activity");
    expect(activity.mentionsYou).toBe(true);

    aliceSocket.close();
    bobSocket.close();
  });

  it("doesn't notify a member who has this room open (they get message_created live instead)", async () => {
    const { aliceSocket, bobSocket, room } =
      await setUpRoomWithTwoJoinedMembers(ctx.server, "general");

    aliceSocket.send({ type: "send", roomId: room.id, content: "hello" });
    await bobSocket.waitFor((m) => m.type === "message_created");

    await bobSocket.assertNoneWithin((m) => m.type === "room_activity");

    aliceSocket.close();
    bobSocket.close();
  });

  it("doesn't notify the sender about their own message", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");

    const aliceOtherTab = await connectSocket(ctx.server.wsUrl, alice.cookies);
    const aliceSocket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(aliceSocket, room.id);

    aliceSocket.send({ type: "send", roomId: room.id, content: "hello" });
    await aliceSocket.waitFor((m) => m.type === "message_created");

    await aliceOtherTab.assertNoneWithin((m) => m.type === "room_activity");

    aliceSocket.close();
    aliceOtherTab.close();
  });
});
