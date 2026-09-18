import { getPrisma } from "./prisma.js";
import type { Room, RoomMember } from "../generated/prisma/client.js";

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
