import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestServer, type TestServer } from "./testServer.js";
import { truncateAllTables } from "./testDb.js";
import {
  registerUser,
  createRoom,
  addRoomMember,
  connectSocket,
} from "./testClient.js";

describe("presence", () => {
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

  it("notifies a room's other members when someone comes online, room-wide not just in a joined room", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");

    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);

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
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");

    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);
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
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");

    const bobTabOne = await connectSocket(server.wsUrl, bob.cookies);
    await aliceSocket.waitFor(
      (m) =>
        m.type === "presence_changed" &&
        m.userId === bob.id &&
        m.online === true,
    );
    const bobTabTwo = await connectSocket(server.wsUrl, bob.cookies);

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
