import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findActiveRoomById,
  findMembership,
  removeMember,
} from "../../db/rooms.js";
import { isRecordNotFoundError } from "../../db/prismaErrors.js";
import { sendServerMessage } from "../../ws/messages.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";
import {
  isRoomOwnerOrAdmin,
  ROOM_NOT_FOUND,
  type RoomMutationPayload,
} from "./roomErrors.js";

const MEMBER_NOT_FOUND: GraphQLUserError = {
  field: ["userId"],
  message: "That user is not a member of this room",
};

const CANNOT_REMOVE_OWNER: GraphQLUserError = {
  field: ["userId"],
  message: "Cannot remove the room owner",
};

export async function removeRoomMember(
  _parent: unknown,
  { roomId, userId }: { roomId: string; userId: string },
  context: GraphQLContext,
): Promise<RoomMutationPayload> {
  const user = await requireActiveUser(context);

  const room = await findActiveRoomById(roomId);
  if (!room) {
    return { room: null, userErrors: [ROOM_NOT_FOUND] };
  }

  const callerMembership = await findMembership(roomId, user.id);
  if (!isRoomOwnerOrAdmin(callerMembership, user)) {
    throw new GraphQLError(
      "Only the room owner or an admin can remove members",
      { extensions: { code: "FORBIDDEN" } },
    );
  }

  const targetMembership = await findMembership(roomId, userId);
  if (!targetMembership) {
    return { room: null, userErrors: [MEMBER_NOT_FOUND] };
  }
  if (targetMembership.role === "OWNER") {
    return { room: null, userErrors: [CANNOT_REMOVE_OWNER] };
  }

  try {
    await removeMember(roomId, userId);
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return { room: null, userErrors: [MEMBER_NOT_FOUND] };
    }
    throw err;
  }

  for (const socket of context.connectionRegistry.getSockets(userId)) {
    if (context.roomRegistry.isMember(socket, roomId)) {
      sendServerMessage(socket, { type: "removed_from_room", roomId });
      context.roomRegistry.leave(socket, roomId);
    }
  }

  return { room, userErrors: [] };
}
