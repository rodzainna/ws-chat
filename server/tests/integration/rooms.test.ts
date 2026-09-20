import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { startTestServer, type TestServer } from "./testServer.js";
import { truncateAllTables } from "./testDb.js";
import {
  registerUser,
  createRoom,
  addRoomMember,
  connectSocket,
} from "./testClient.js";

describe("room join/leave and broadcast", () => {
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

  it("lets a member join a public room and receive a joined confirmation", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const room = await createRoom(server.baseUrl, alice, "general");
    const socket = await connectSocket(server.wsUrl, alice.cookies);

    socket.send({ type: "join", roomId: room.id });
    const joined = await socket.waitFor((m) => m.type === "joined");
    expect(joined).toEqual({ type: "joined", roomId: room.id });

    socket.close();
  });

  it("rejects joining a private room you're not a member of", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "leadership", true);
    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);

    bobSocket.send({ type: "join", roomId: room.id });
    const error = await bobSocket.waitFor((m) => m.type === "error");
    expect(error.code).toBe("FORBIDDEN");

    bobSocket.close();
  });

  it("broadcasts a sent message to every other member joined to the room, in real time", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);

    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");
    bobSocket.send({ type: "join", roomId: room.id });
    await bobSocket.waitFor((m) => m.type === "joined");

    aliceSocket.send({ type: "send", roomId: room.id, content: "hi bob" });

    const received = await bobSocket.waitFor(
      (m) => m.type === "message_created",
    );
    const message = received.message as { content: string; username: string };
    expect(message.content).toBe("hi bob");
    expect(message.username).toBe("alice");

    aliceSocket.close();
    bobSocket.close();
  });

  it("stops delivering a room's messages once you've left it", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const bob = await registerUser(server.baseUrl, "bob");
    const room = await createRoom(server.baseUrl, alice, "general");
    await addRoomMember(server.baseUrl, alice, room.id, "bob");

    const aliceSocket = await connectSocket(server.wsUrl, alice.cookies);
    const bobSocket = await connectSocket(server.wsUrl, bob.cookies);

    aliceSocket.send({ type: "join", roomId: room.id });
    await aliceSocket.waitFor((m) => m.type === "joined");
    bobSocket.send({ type: "join", roomId: room.id });
    await bobSocket.waitFor((m) => m.type === "joined");

    bobSocket.send({ type: "leave", roomId: room.id });
    await new Promise((resolve) => setTimeout(resolve, 100));

    aliceSocket.send({
      type: "send",
      roomId: room.id,
      content: "are you there?",
    });

    await bobSocket.assertNoneWithin((m) => m.type === "message_created");

    aliceSocket.close();
    bobSocket.close();
  });

  it("rejects sending to a room you haven't joined over this socket", async () => {
    const alice = await registerUser(server.baseUrl, "alice");
    const room = await createRoom(server.baseUrl, alice, "general");
    const socket = await connectSocket(server.wsUrl, alice.cookies);

    socket.send({ type: "send", roomId: room.id, content: "hello" });
    const error = await socket.waitFor((m) => m.type === "error");
    expect(error.code).toBe("NOT_IN_ROOM");

    socket.close();
  });
});
