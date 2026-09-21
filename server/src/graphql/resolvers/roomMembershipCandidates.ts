import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findActiveRoomById,
  findMembership,
  findUsersNotInRoom,
} from "../../db/rooms.js";
import type { User } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import { isRoomOwnerOrAdmin } from "./roomErrors.js";

export async function roomMembershipCandidates(
  _parent: unknown,
  { roomId }: { roomId: string },
  context: GraphQLContext,
): Promise<User[]> {
  const user = await requireActiveUser(context);

  const room = await findActiveRoomById(roomId);
  if (!room) {
    throw new GraphQLError("Room not found", {
      extensions: { code: "NOT_FOUND" },
    });
  }

  const membership = await findMembership(roomId, user.id);
  if (!isRoomOwnerOrAdmin(membership, user)) {
    throw new GraphQLError(
      "Only the room owner or an admin can view addable users",
      { extensions: { code: "FORBIDDEN" } },
    );
  }

  return findUsersNotInRoom(roomId);
}
