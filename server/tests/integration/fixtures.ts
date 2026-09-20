import { beforeAll, afterAll, beforeEach } from "vitest";
import { startTestServer, type TestServer } from "./testServer.js";
import { truncateAllTables } from "./testDb.js";
import {
  registerUsers,
  createRoom,
  addRoomMember,
  connectSocket,
  joinRoomOverSocket,
  type TestUser,
  type TestSocket,
} from "./testClient.js";

export function setupIntegrationTest(): { readonly server: TestServer } {
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

  return {
    get server() {
      return server;
    },
  };
}

export async function setUpRoomWithTwoJoinedMembers(
  server: TestServer,
  roomName: string,
  isPrivate = false,
): Promise<{
  alice: TestUser;
  bob: TestUser;
  room: { id: string; name: string; isPrivate: boolean };
  aliceSocket: TestSocket;
  bobSocket: TestSocket;
}> {
  const [alice, bob] = await registerUsers(server.baseUrl, ["alice", "bob"]);
  const room = await createRoom(server.baseUrl, alice, roomName, isPrivate);
  await addRoomMember(server.baseUrl, alice, room.id, "bob");
  const [aliceSocket, bobSocket] = await Promise.all([
    connectSocket(server.wsUrl, alice.cookies),
    connectSocket(server.wsUrl, bob.cookies),
  ]);
  await Promise.all([
    joinRoomOverSocket(aliceSocket, room.id),
    joinRoomOverSocket(bobSocket, room.id),
  ]);
  return { alice, bob, room, aliceSocket, bobSocket };
}
