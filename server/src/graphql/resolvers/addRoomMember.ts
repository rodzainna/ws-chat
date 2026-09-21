import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findActiveRoomById,
  findMembership,
  addMember,
} from "../../db/rooms.js";
import { findUserByUsername } from "../../db/users.js";
import { isUniqueConstraintViolation } from "../../db/prismaErrors.js";
import { sendServerMessage, type ServerMessage } from "../../ws/messages.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";
import {
  canAddRoomMembers,
  ROOM_NOT_FOUND,
  type RoomMutationPayload,
} from "./roomErrors.js";

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

  if (!canAddRoomMembers(user)) {
    throw new GraphQLError("Restricted users cannot add room members", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const [room, targetUser] = await Promise.all([
    findActiveRoomById(roomId),
    findUserByUsername(username),
  ]);
  if (!room) {
    return { room: null, userErrors: [ROOM_NOT_FOUND] };
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

  context.roomRegistry.broadcast(
    roomId,
    JSON.stringify({
      type: "room_members_changed",
      roomId,
    } satisfies ServerMessage),
  );

  for (const socket of context.connectionRegistry.getSockets(targetUser.id)) {
    sendServerMessage(socket, { type: "added_to_room", roomId });
  }

  return { room, userErrors: [] };
}
