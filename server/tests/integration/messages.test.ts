import { describe, it, expect } from "vitest";
import {
  setupIntegrationTest,
  setUpRoomWithTwoJoinedMembers,
} from "./fixtures.js";
import {
  registerUsers,
  createRoom,
  connectSocket,
  joinRoomOverSocket,
  type TestSocket,
} from "./testClient.js";

const MESSAGE_RATE_LIMIT = 10;

async function sendAndAwaitCreated(
  socket: TestSocket,
  roomId: string,
  content: string,
): Promise<{ id: string; content: string }> {
  socket.send({ type: "send", roomId, content });
  const event = await socket.waitFor((m) => m.type === "message_created");
  return event.message as { id: string; content: string };
}

describe("message edit/delete and rate limiting", () => {
  const ctx = setupIntegrationTest();

  it("broadcasts an edit to every joined member, including the editor", async () => {
    const { aliceSocket, bobSocket, room } =
      await setUpRoomWithTwoJoinedMembers(ctx.server, "general");

    const created = await sendAndAwaitCreated(aliceSocket, room.id, "typo");
    await bobSocket.waitFor((m) => m.type === "message_created");

    aliceSocket.send({
      type: "edit",
      roomId: room.id,
      messageId: created.id,
      content: "fixed",
    });

    const editedForBob = await bobSocket.waitFor(
      (m) => m.type === "message_edited",
    );
    expect(editedForBob).toMatchObject({
      messageId: created.id,
      content: "fixed",
    });
    const editedForAlice = await aliceSocket.waitFor(
      (m) => m.type === "message_edited",
    );
    expect(editedForAlice).toMatchObject({
      messageId: created.id,
      content: "fixed",
    });

    aliceSocket.close();
    bobSocket.close();
  });

  it("rejects editing someone else's message", async () => {
    const { aliceSocket, bobSocket, room } =
      await setUpRoomWithTwoJoinedMembers(ctx.server, "general");

    const created = await sendAndAwaitCreated(
      aliceSocket,
      room.id,
      "alice's message",
    );
    await bobSocket.waitFor((m) => m.type === "message_created");

    bobSocket.send({
      type: "edit",
      roomId: room.id,
      messageId: created.id,
      content: "bob was here",
    });

    const error = await bobSocket.waitFor((m) => m.type === "error");
    expect(error.code).toBe("FORBIDDEN");

    aliceSocket.close();
    bobSocket.close();
  });

  it("broadcasts a delete to every joined member", async () => {
    const { aliceSocket, bobSocket, room } =
      await setUpRoomWithTwoJoinedMembers(ctx.server, "general");

    const created = await sendAndAwaitCreated(
      aliceSocket,
      room.id,
      "delete me",
    );
    await bobSocket.waitFor((m) => m.type === "message_created");

    aliceSocket.send({
      type: "delete",
      roomId: room.id,
      messageId: created.id,
    });

    const deletedForBob = await bobSocket.waitFor(
      (m) => m.type === "message_deleted",
    );
    expect(deletedForBob).toEqual({
      type: "message_deleted",
      messageId: created.id,
    });

    aliceSocket.close();
    bobSocket.close();
  });

  it("rejects deleting someone else's message", async () => {
    const { aliceSocket, bobSocket, room } =
      await setUpRoomWithTwoJoinedMembers(ctx.server, "general");

    const created = await sendAndAwaitCreated(
      aliceSocket,
      room.id,
      "alice's message",
    );
    await bobSocket.waitFor((m) => m.type === "message_created");

    bobSocket.send({
      type: "delete",
      roomId: room.id,
      messageId: created.id,
    });

    const error = await bobSocket.waitFor((m) => m.type === "error");
    expect(error.code).toBe("FORBIDDEN");

    aliceSocket.close();
    bobSocket.close();
  });

  it("rate-limits a burst of sends past the configured capacity", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(socket, room.id);

    for (let i = 0; i < MESSAGE_RATE_LIMIT; i++) {
      socket.send({ type: "send", roomId: room.id, content: `msg ${i}` });
      await socket.waitFor((m) => m.type === "message_created");
    }

    socket.send({ type: "send", roomId: room.id, content: "one too many" });
    const error = await socket.waitFor((m) => m.type === "error");
    expect(error.code).toBe("RATE_LIMITED");

    socket.close();
  });
});
