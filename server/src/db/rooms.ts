import { getPrisma } from "./prisma.js";
import type {
  Room,
  RoomMember,
  RoomRole,
  User,
} from "../generated/prisma/client.js";

export function findRoomById(id: string): Promise<Room | null> {
  return getPrisma().room.findUnique({ where: { id } });
}

export async function findActiveRoomById(id: string): Promise<Room | null> {
  const room = await findRoomById(id);
  return room && room.deletedAt === null ? room : null;
}

export function findMembership(
  roomId: string,
  userId: string,
): Promise<RoomMember | null> {
  return getPrisma().roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
  });
}

// the one access check for both WS and GraphQL, so they can't drift.
// Also checks the room isn't deleted and the user is still active, since a
// WS socket was only authenticated once, at connect time.
export async function canAccessRoom(
  userId: string,
  roomId: string,
): Promise<boolean> {
  const membership = await getPrisma().roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    include: { room: true, user: true },
  });
  return (
    membership !== null &&
    membership.room.deletedAt === null &&
    membership.user.isActive
  );
}

export function createRoomWithOwner(input: {
  name: string;
  isPrivate: boolean;
  creatorId: string;
}): Promise<Room> {
  return getPrisma().room.create({
    data: {
      name: input.name,
      isPrivate: input.isPrivate,
      createdBy: input.creatorId,
      members: {
        create: { userId: input.creatorId, role: "OWNER" },
      },
    },
  });
}

export function addMember(roomId: string, userId: string): Promise<RoomMember> {
  return getPrisma().roomMember.create({
    data: { roomId, userId, role: "MEMBER" },
  });
}

export async function findRoomMembersByUsernames(
  roomId: string,
  usernames: string[],
): Promise<User[]> {
  const members = await getPrisma().roomMember.findMany({
    where: {
      roomId,
      user: { username: { in: usernames.map((u) => u.toLowerCase()) } },
    },
    include: { user: true },
  });
  return members.map((m) => m.user);
}

export async function findRoomMembers(
  roomId: string,
): Promise<{ user: User; role: RoomRole }[]> {
  const members = await getPrisma().roomMember.findMany({
    where: { roomId },
    include: { user: true },
  });
  return members.map((m) => ({ user: m.user, role: m.role }));
}

export async function findRoomIdsForUser(userId: string): Promise<string[]> {
  const memberships = await getPrisma().roomMember.findMany({
    where: { userId },
    select: { roomId: true },
  });
  return memberships.map((m) => m.roomId);
}

export async function findMemberUserIdsForRoom(
  roomId: string,
): Promise<string[]> {
  const members = await getPrisma().roomMember.findMany({
    where: { roomId },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}

// deletedAt: null in the WHERE so only one concurrent delete wins (and
// broadcasts)
export async function softDeleteRoom(id: string): Promise<Room | null> {
  const [updated] = await getPrisma().room.updateManyAndReturn({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return updated ?? null;
}

export function findVisibleRooms(userId: string) {
  return getPrisma().room.findMany({
    where: {
      deletedAt: null,
      OR: [{ isPrivate: false }, { members: { some: { userId } } }],
    },
    include: {
      members: { where: { userId }, select: { userId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export function findRoomsPage(input: {
  take: number;
  afterId?: string;
  callerId: string;
}) {
  return getPrisma().room.findMany({
    where: { deletedAt: null },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: input.take,
    ...(input.afterId ? { cursor: { id: input.afterId }, skip: 1 } : {}),
    include: {
      members: { where: { userId: input.callerId }, select: { userId: true } },
    },
  });
}

export function countRooms(): Promise<number> {
  return getPrisma().room.count({ where: { deletedAt: null } });
}
