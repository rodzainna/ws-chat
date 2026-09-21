import { describe, it, expect } from "vitest";
import { setupIntegrationTest } from "./fixtures.js";
import {
  registerUsers,
  createRoom,
  connectSocket,
  joinRoomOverSocket,
  graphqlRequest,
  type TestSocket,
} from "./testClient.js";

const MESSAGES_QUERY = `
  query Messages($roomId: ID!, $last: Int, $before: String) {
    messages(roomId: $roomId, last: $last, before: $before) {
      edges {
        cursor
        node { id content }
      }
      pageInfo {
        hasPreviousPage
        startCursor
        hasNextPage
        endCursor
      }
    }
  }
`;

type MessagesResult = {
  messages: {
    edges: { cursor: string; node: { id: string; content: string } }[];
    pageInfo: {
      hasPreviousPage: boolean;
      startCursor: string | null;
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

async function sendAndAwaitCreated(
  socket: TestSocket,
  roomId: string,
  content: string,
): Promise<void> {
  socket.send({ type: "send", roomId, content });
  await socket.waitFor((m) => m.type === "message_created");
}

describe("messages query — backward pagination", () => {
  const ctx = setupIntegrationTest();

  it("returns the newest page, oldest-to-newest, with hasPreviousPage true when older messages exist", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(socket, room.id);

    for (let i = 0; i < 7; i++) {
      await sendAndAwaitCreated(socket, room.id, `msg ${i}`);
    }

    const result = await graphqlRequest<MessagesResult>(
      ctx.server.baseUrl,
      MESSAGES_QUERY,
      { roomId: room.id, last: 3 },
      alice.cookies,
    );

    expect(result.data?.messages.edges.map((e) => e.node.content)).toEqual([
      "msg 4",
      "msg 5",
      "msg 6",
    ]);
    expect(result.data?.messages.pageInfo.hasPreviousPage).toBe(true);
    expect(result.data?.messages.pageInfo.startCursor).toBe(
      result.data?.messages.edges[0]?.cursor,
    );

    socket.close();
  });

  it("walks further back with before, contiguous with the page already loaded", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(socket, room.id);

    for (let i = 0; i < 7; i++) {
      await sendAndAwaitCreated(socket, room.id, `msg ${i}`);
    }

    const firstPage = await graphqlRequest<MessagesResult>(
      ctx.server.baseUrl,
      MESSAGES_QUERY,
      { roomId: room.id, last: 3 },
      alice.cookies,
    );
    const cursorBeforeFirstPage = firstPage.data?.messages.pageInfo.startCursor;

    const secondPage = await graphqlRequest<MessagesResult>(
      ctx.server.baseUrl,
      MESSAGES_QUERY,
      { roomId: room.id, last: 3, before: cursorBeforeFirstPage },
      alice.cookies,
    );
    expect(secondPage.data?.messages.edges.map((e) => e.node.content)).toEqual([
      "msg 1",
      "msg 2",
      "msg 3",
    ]);
    expect(secondPage.data?.messages.pageInfo.hasPreviousPage).toBe(true);

    const thirdPage = await graphqlRequest<MessagesResult>(
      ctx.server.baseUrl,
      MESSAGES_QUERY,
      {
        roomId: room.id,
        last: 3,
        before: secondPage.data?.messages.pageInfo.startCursor,
      },
      alice.cookies,
    );
    expect(thirdPage.data?.messages.edges.map((e) => e.node.content)).toEqual([
      "msg 0",
    ]);
    expect(thirdPage.data?.messages.pageInfo.hasPreviousPage).toBe(false);

    socket.close();
  });

  it("reports hasPreviousPage false when every message already fits on one page", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(socket, room.id);

    await sendAndAwaitCreated(socket, room.id, "only message");

    const result = await graphqlRequest<MessagesResult>(
      ctx.server.baseUrl,
      MESSAGES_QUERY,
      { roomId: room.id, last: 50 },
      alice.cookies,
    );

    expect(result.data?.messages.edges).toHaveLength(1);
    expect(result.data?.messages.pageInfo.hasPreviousPage).toBe(false);

    socket.close();
  });

  it("defaults to the latest messages when last is omitted", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");
    const socket = await connectSocket(ctx.server.wsUrl, alice.cookies);
    await joinRoomOverSocket(socket, room.id);

    await sendAndAwaitCreated(socket, room.id, "hello");
    await sendAndAwaitCreated(socket, room.id, "world");

    const result = await graphqlRequest<MessagesResult>(
      ctx.server.baseUrl,
      "query Messages($roomId: ID!) { messages(roomId: $roomId) { edges { node { content } } } }",
      { roomId: room.id },
      alice.cookies,
    );

    expect(result.data?.messages.edges.map((e) => e.node.content)).toEqual([
      "hello",
      "world",
    ]);

    socket.close();
  });

  it("rejects a non-positive last with BAD_USER_INPUT", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");

    const result = await graphqlRequest(
      ctx.server.baseUrl,
      MESSAGES_QUERY,
      { roomId: room.id, last: 0 },
      alice.cookies,
    );

    expect(result.errors?.[0]?.message).toMatch(/positive integer/i);
  });

  it("rejects a caller who isn't a member of the room", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(ctx.server.baseUrl, alice, "general");

    const result = await graphqlRequest(
      ctx.server.baseUrl,
      MESSAGES_QUERY,
      { roomId: room.id, last: 10 },
      bob.cookies,
    );

    expect(result.errors?.[0]?.message).toMatch(/not a member/i);
  });
});
