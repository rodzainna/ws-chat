import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { findActiveRoomById, findUsersNotInRoom } from "../../db/rooms.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import { canAddRoomMembers } from "./roomErrors.js";

export async function roomMembershipCandidates(
  _parent: unknown,
  { roomId }: { roomId: string },
  context: GraphQLContext,
): Promise<User[]> {
  const user = await requireActiveUser(context);

  if (!canAddRoomMembers(user)) {
    throw new GraphQLError("Restricted users cannot add room members", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const room = await findActiveRoomById(roomId);
  if (!room) {
    throw new GraphQLError("Room not found", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  return findUsersNotInRoom(roomId);
}
