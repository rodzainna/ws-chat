import { describe, it, expect } from "vitest";
import {
  setupIntegrationTest,
  setUpRoomWithTwoJoinedMembers,
} from "./fixtures.js";
import { promoteToAdmin } from "./testDb.js";
import {
  registerUsers,
  createRoom,
  addRoomMember,
  removeRoomMember,
  setGlobalRole,
  graphqlRequest,
  connectSocket,
  joinRoomOverSocket,
} from "./testClient.js";

const ADD_ROOM_MEMBER_MUTATION = `
  mutation AddRoomMember($roomId: ID!, $username: String!) {
    addRoomMember(roomId: $roomId, username: $username) {
      room { id }
      userErrors { field message }
    }
  }
`;

const REMOVE_ROOM_MEMBER_MUTATION = `
  mutation RemoveRoomMember($roomId: ID!, $userId: ID!) {
    removeRoomMember(roomId: $roomId, userId: $userId) {
      room { id }
      userErrors { field message }
    }
  }
`;

const ROOM_MEMBERS_QUERY = `
  query RoomMembers($roomId: ID!) {
    roomMembers(roomId: $roomId) {
      user { id username }
      role
    }
  }
`;

describe("addRoomMember", () => {
  const ctx = setupIntegrationTest();

  it("lets the room owner add a member by username", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice", "bob"]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );

    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const result = await graphqlRequest<{
      roomMembers: { user: { username: string } }[];
    }>(
      ctx.server.baseUrl,
      ROOM_MEMBERS_QUERY,
      { roomId: room.id },
      alice.cookies,
    );
    const usernames = result.data?.roomMembers.map((m) => m.user.username);
    expect(usernames).toContain("bob");
  });

  it("lets a global admin add a member to a room they don't own or belong to", async () => {
    const [admin, alice] = await registerUsers(ctx.server.baseUrl, [
      "admin",
      "alice",
      "bob",
    ]);
    await promoteToAdmin(admin.id);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );

    await addRoomMember(ctx.server.baseUrl, admin, room.id, "bob");

    const result = await graphqlRequest<{
      roomMembers: { user: { username: string } }[];
    }>(
      ctx.server.baseUrl,
      ROOM_MEMBERS_QUERY,
      { roomId: room.id },
      alice.cookies,
    );
    expect(result.data?.roomMembers.map((m) => m.user.username)).toContain(
      "bob",
    );
  });

  it("lets a regular user who neither owns nor belongs to the room add a member", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
      "dave",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );

    await addRoomMember(ctx.server.baseUrl, bob, room.id, "dave");

    const result = await graphqlRequest<{
      roomMembers: { user: { username: string } }[];
    }>(
      ctx.server.baseUrl,
      ROOM_MEMBERS_QUERY,
      { roomId: room.id },
      alice.cookies,
    );
    expect(result.data?.roomMembers.map((m) => m.user.username)).toContain(
      "dave",
    );
  });

  it("rejects a RESTRICTED caller", async () => {
    const [alice, , carol, admin] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
      "carol",
      "admin",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await promoteToAdmin(admin.id);
    await setGlobalRole(ctx.server.baseUrl, admin, carol.id, "RESTRICTED");

    const result = await graphqlRequest(
      ctx.server.baseUrl,
      ADD_ROOM_MEMBER_MUTATION,
      { roomId: room.id, username: "bob" },
      carol.cookies,
    );

    expect(result.errors?.[0]?.message).toMatch(/restricted/i);
  });

  it("returns a clean userError for a username that doesn't exist", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice"]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );

    const result = await graphqlRequest<{
      addRoomMember: {
        room: { id: string } | null;
        userErrors: { message: string }[];
      };
    }>(
      ctx.server.baseUrl,
      ADD_ROOM_MEMBER_MUTATION,
      { roomId: room.id, username: "ghost" },
      alice.cookies,
    );

    expect(result.data?.addRoomMember.room).toBeNull();
    expect(result.data?.addRoomMember.userErrors[0]?.message).toMatch(
      /not found/i,
    );
  });

  it("returns a clean userError for a user who's already a member", async () => {
    const [alice] = await registerUsers(ctx.server.baseUrl, ["alice", "bob"]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const result = await graphqlRequest<{
      addRoomMember: {
        room: { id: string } | null;
        userErrors: { message: string }[];
      };
    }>(
      ctx.server.baseUrl,
      ADD_ROOM_MEMBER_MUTATION,
      { roomId: room.id, username: "bob" },
      alice.cookies,
    );

    expect(result.data?.addRoomMember.room).toBeNull();
    expect(result.data?.addRoomMember.userErrors[0]?.message).toMatch(
      /already a member/i,
    );
  });

  it("broadcasts room_members_changed to others already viewing the room", async () => {
    const [alice, , carol] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
      "carol",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "carol");
    const carolSocket = await connectSocket(ctx.server.wsUrl, carol.cookies);
    await joinRoomOverSocket(carolSocket, room.id);

    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const notice = await carolSocket.waitFor(
      (m) => m.type === "room_members_changed",
    );
    expect(notice).toEqual({ type: "room_members_changed", roomId: room.id });
  });

  it("notifies the added user's own socket via added_to_room, even with no room open", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    const bobSocket = await connectSocket(ctx.server.wsUrl, bob.cookies);

    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const notice = await bobSocket.waitFor((m) => m.type === "added_to_room");
    expect(notice).toEqual({ type: "added_to_room", roomId: room.id });
  });
});

describe("removeRoomMember", () => {
  const ctx = setupIntegrationTest();

  it("rejects a room owner who isn't a global admin", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    const result = await graphqlRequest(
      ctx.server.baseUrl,
      REMOVE_ROOM_MEMBER_MUTATION,
      { roomId: room.id, userId: bob.id },
      alice.cookies,
    );

    expect(result.errors?.[0]?.message).toMatch(/admin/i);
  });

  it("lets a global admin remove a member from a room they don't own", async () => {
    const [admin, alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "admin",
      "alice",
      "bob",
    ]);
    await promoteToAdmin(admin.id);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");

    await removeRoomMember(ctx.server.baseUrl, admin, room.id, bob.id);

    const result = await graphqlRequest<{
      roomMembers: { user: { username: string } }[];
    }>(
      ctx.server.baseUrl,
      ROOM_MEMBERS_QUERY,
      { roomId: room.id },
      alice.cookies,
    );
    expect(result.data?.roomMembers.map((m) => m.user.username)).not.toContain(
      "bob",
    );
  });

  it("rejects a non-owner, non-admin member", async () => {
    const [alice, bob, carol] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
      "carol",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "carol");

    const result = await graphqlRequest(
      ctx.server.baseUrl,
      REMOVE_ROOM_MEMBER_MUTATION,
      { roomId: room.id, userId: carol.id },
      bob.cookies,
    );

    expect(result.errors?.[0]?.message).toMatch(/admin/i);
  });

  it("blocks removing the room's owner", async () => {
    const [admin, alice] = await registerUsers(ctx.server.baseUrl, [
      "admin",
      "alice",
    ]);
    await promoteToAdmin(admin.id);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );

    const result = await graphqlRequest<{
      removeRoomMember: {
        room: { id: string } | null;
        userErrors: { message: string }[];
      };
    }>(
      ctx.server.baseUrl,
      REMOVE_ROOM_MEMBER_MUTATION,
      { roomId: room.id, userId: alice.id },
      admin.cookies,
    );

    expect(result.data?.removeRoomMember.room).toBeNull();
    expect(result.data?.removeRoomMember.userErrors[0]?.message).toMatch(
      /owner/i,
    );
  });

  it("returns a clean userError for removing someone who isn't a member", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    await promoteToAdmin(alice.id);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );

    const result = await graphqlRequest<{
      removeRoomMember: {
        room: { id: string } | null;
        userErrors: { message: string }[];
      };
    }>(
      ctx.server.baseUrl,
      REMOVE_ROOM_MEMBER_MUTATION,
      { roomId: room.id, userId: bob.id },
      alice.cookies,
    );

    expect(result.data?.removeRoomMember.room).toBeNull();
    expect(result.data?.removeRoomMember.userErrors[0]?.message).toMatch(
      /not a member/i,
    );
  });

  it("evicts a removed member's live socket from the room", async () => {
    const { alice, bob, room, bobSocket } = await setUpRoomWithTwoJoinedMembers(
      ctx.server,
      "leadership",
      true,
    );
    await promoteToAdmin(alice.id);

    await removeRoomMember(ctx.server.baseUrl, alice, room.id, bob.id);

    const notice = await bobSocket.waitFor(
      (m) => m.type === "removed_from_room",
    );
    expect(notice).toEqual({ type: "removed_from_room", roomId: room.id });

    bobSocket.send({ type: "send", roomId: room.id, content: "still here?" });
    const error = await bobSocket.waitFor((m) => m.type === "error");
    expect(error.code).toBe("NOT_IN_ROOM");
  });

  it("doesn't evict a member with no live socket (no-op, not a crash)", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");
    await promoteToAdmin(alice.id);

    await expect(
      removeRoomMember(ctx.server.baseUrl, alice, room.id, bob.id),
    ).resolves.toBeUndefined();
  });

  it("broadcasts room_members_changed to others still viewing the room", async () => {
    const [alice, bob, carol] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
      "carol",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "carol");
    await promoteToAdmin(alice.id);
    const carolSocket = await connectSocket(ctx.server.wsUrl, carol.cookies);
    await joinRoomOverSocket(carolSocket, room.id);

    await removeRoomMember(ctx.server.baseUrl, alice, room.id, bob.id);

    const notice = await carolSocket.waitFor(
      (m) => m.type === "room_members_changed",
    );
    expect(notice).toEqual({ type: "room_members_changed", roomId: room.id });
  });

  it("notifies the removed user's socket even when it isn't joined to that room", async () => {
    const [alice, bob] = await registerUsers(ctx.server.baseUrl, [
      "alice",
      "bob",
    ]);
    const room = await createRoom(
      ctx.server.baseUrl,
      alice,
      "leadership",
      true,
    );
    await addRoomMember(ctx.server.baseUrl, alice, room.id, "bob");
    await promoteToAdmin(alice.id);
    const bobSocket = await connectSocket(ctx.server.wsUrl, bob.cookies);

    await removeRoomMember(ctx.server.baseUrl, alice, room.id, bob.id);

    const notice = await bobSocket.waitFor(
      (m) => m.type === "removed_from_room",
    );
    expect(notice).toEqual({ type: "removed_from_room", roomId: room.id });
  });
});
