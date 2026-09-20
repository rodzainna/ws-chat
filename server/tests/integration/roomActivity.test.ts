import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestServer, type TestServer } from "./testServer.js";
import { truncateAllTables } from "./testDb.js";
import {
  registerUser,
  createRoom,
  addRoomMember,
  connectSocket,
} from "./testClient.js";

describe("room_activity (unread/mention signal for rooms you're not viewing)", () => {
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

  it("notifies a member whose socket is connected but not joined to the room", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");

    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);

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
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");
    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);

    aliceSocket.send({ type: "send", roomId: room.id, content: "hey @bob" });

    const activity = await bobSocket.waitFor((m) => m.type === "room_activity");
    expect(activity.mentionsYou).toBe(true);

    aliceSocket.close();
    bobSocket.close();
  });

  it("doesn't notify a member who has this room open (they get message_created live instead)", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);
    for (const socket of [aliceSocket, bobSocket]) {
      socket.send({ type: "join", roomId: room.id });
      await socket.waitFor((m) => m.type === "joined");
    }

    aliceSocket.send({ type: "send", roomId: room.id, content: "hello" });
    await bobSocket.waitFor((m) => m.type === "message_created");

    await bobSocket.assertNoneWithin((m) => m.type === "room_activity");

    aliceSocket.close();
    bobSocket.close();
  });

  it("doesn't notify the sender about their own message", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const room = await createRoom(server.baseUrl, alice, "general");

    const aliceOtherTab = await connectSocket(server.wsUrl, alice.cookies);
    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");

    aliceSocket.send({ type: "send", roomId: room.id, content: "hello" });
    await aliceSocket.waitFor((m) => m.type === "message_created");

    await aliceOtherTab.assertNoneWithin((m) => m.type === "room_activity");

    aliceSocket.close();
    aliceOtherTab.close();
  });
});
