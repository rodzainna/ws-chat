import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findActiveRoomById,
  findMembership,
  removeMember,
} from "../../db/rooms.js";
import { isRecordNotFoundError } from "../../db/prismaErrors.js";
import { sendServerMessage, type ServerMessage } from "../../ws/messages.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";
import { ROOM_NOT_FOUND, type RoomMutationPayload } from "./roomErrors.js";

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

  if (user.globalRole !== "ADMIN") {
    throw new GraphQLError("Only an admin can remove room members", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const room = await findActiveRoomById(roomId);
  if (!room) {
    return { room: null, userErrors: [ROOM_NOT_FOUND] };
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

  context.roomRegistry.broadcast(
    roomId,
    JSON.stringify({
      type: "room_members_changed",
      roomId,
    } satisfies ServerMessage),
  );

  // notify all of the user's sockets so their sidebar updates, and evict
  // the joined ones: sockets trust the registry, not the DB
  for (const socket of context.connectionRegistry.getSockets(userId)) {
    sendServerMessage(socket, { type: "removed_from_room", roomId });
    if (context.roomRegistry.isMember(socket, roomId)) {
      context.roomRegistry.leave(socket, roomId);
    }
  }

  return { room, userErrors: [] };
}
