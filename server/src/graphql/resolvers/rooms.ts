import { requireActiveUser } from "../currentUser.js";
import { findVisibleRooms } from "../../db/rooms.js";
import type { GraphQLContext } from "../context.js";

export async function rooms(
  _parent: unknown,
  _args: unknown,
  context: GraphQLContext,
) {
  const user = await requireActiveUser(context);
  const visible = await findVisibleRooms(user.id);
  return visible.map((room) => ({
    ...room,
    isMember: room.members.length > 0,
  }));
}
