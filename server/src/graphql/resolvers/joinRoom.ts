import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findActiveRoomById,
  findMembership,
  addMember,
} from "../../db/rooms.js";
import { isUniqueConstraintViolation } from "../../db/prismaErrors.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";
import { ROOM_NOT_FOUND, type RoomMutationPayload } from "./roomErrors.js";

const ALREADY_MEMBER: GraphQLUserError = {
  field: ["roomId"],
  message: "You are already a member of this room",
};

const PRIVATE_ROOM: GraphQLUserError = {
  field: ["roomId"],
  message: "This room is private — ask a member or admin to add you",
};

export async function joinRoom(
  _parent: unknown,
  { roomId }: { roomId: string },
  context: GraphQLContext,
): Promise<RoomMutationPayload> {
  const user = await requireActiveUser(context);

  if (user.globalRole === "RESTRICTED") {
    throw new GraphQLError("Restricted users cannot join rooms directly", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const room = await findActiveRoomById(roomId);
  if (!room) {
    return { room: null, userErrors: [ROOM_NOT_FOUND] };
  }

  if (room.isPrivate) {
    return { room: null, userErrors: [PRIVATE_ROOM] };
  }

  const existing = await findMembership(roomId, user.id);
  if (existing) {
    return { room: null, userErrors: [ALREADY_MEMBER] };
  }

  try {
    await addMember(roomId, user.id);
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { room: null, userErrors: [ALREADY_MEMBER] };
    }
    throw err;
  }

  return { room, userErrors: [] };
}
