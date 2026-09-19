import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { canAccessRoom, findRoomMembers } from "../../db/rooms.js";
import type { User, RoomRole } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";

type RoomMemberResult = { user: User; role: RoomRole; isOnline: boolean };

export async function roomMembers(
  _parent: unknown,
  { roomId }: { roomId: string },
  context: GraphQLContext,
): Promise<RoomMemberResult[]> {
  const user = await requireActiveUser(context);

  const allowed = await canAccessRoom(user.id, roomId);
  if (!allowed) {
    throw new GraphQLError("You are not a member of this room", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const members = await findRoomMembers(roomId);
  return members.map((member) => ({
    ...member,
    isOnline: context.connectionRegistry.isOnline(member.user.id),
  }));
}
