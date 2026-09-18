import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findActiveRoomById,
  findMembership,
  addMember,
} from "../../db/rooms.js";
import { findUserByUsername } from "../../db/users.js";
import { isUniqueConstraintViolation } from "../../db/prismaErrors.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";
import { ROOM_NOT_FOUND, type RoomMutationPayload } from "./roomErrors.js";

const USER_NOT_FOUND: GraphQLUserError = {
  field: ["username"],
  message: "User not found",
};

const ALREADY_MEMBER: GraphQLUserError = {
  field: ["username"],
  message: "That user is already a member of this room",
};

export async function addRoomMember(
  _parent: unknown,
  { roomId, username }: { roomId: string; username: string },
  context: GraphQLContext,
): Promise<RoomMutationPayload> {
  const user = await requireActiveUser(context);

  const [room, targetUser] = await Promise.all([
    findActiveRoomById(roomId),
    findUserByUsername(username),
  ]);
  if (!room) {
    return { room: null, userErrors: [ROOM_NOT_FOUND] };
  }

  const callerMembership = await findMembership(roomId, user.id);
  const isOwner = callerMembership?.role === "OWNER";
  if (!isOwner && user.globalRole !== "ADMIN") {
    throw new GraphQLError("Only the room owner or an admin can add members", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if (!targetUser || !targetUser.isActive) {
    return { room: null, userErrors: [USER_NOT_FOUND] };
  }

  const existing = await findMembership(roomId, targetUser.id);
  if (existing) {
    return { room: null, userErrors: [ALREADY_MEMBER] };
  }

  try {
    await addMember(roomId, targetUser.id);
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { room: null, userErrors: [ALREADY_MEMBER] };
    }
    throw err;
  }

  return { room, userErrors: [] };
}
