import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  findActiveRoomById,
  findMembership,
  softDeleteRoom,
} from "../../db/rooms.js";
import type { GraphQLContext } from "../context.js";
import { ROOM_NOT_FOUND, type RoomMutationPayload } from "./roomErrors.js";
import type { ServerMessage } from "../../ws/messages.js";

export async function deleteRoom(
  _parent: unknown,
  { roomId }: { roomId: string },
  context: GraphQLContext,
): Promise<RoomMutationPayload> {
  const user = await requireActiveUser(context);

  const [room, membership] = await Promise.all([
    findActiveRoomById(roomId),
    findMembership(roomId, user.id),
  ]);
  if (!room) {
    return { room: null, userErrors: [ROOM_NOT_FOUND] };
  }

  const isOwner = membership?.role === "OWNER";
  if (!isOwner && user.globalRole !== "ADMIN") {
    throw new GraphQLError(
      "Only the room owner or an admin can delete this room",
      { extensions: { code: "FORBIDDEN" } },
    );
  }

  const deleted = await softDeleteRoom(roomId);
  if (!deleted) {
    return { room: null, userErrors: [ROOM_NOT_FOUND] };
  }

  // broadcast while members are still registered, then evict: sockets trust
  // the registry, so a client ignoring the frame could keep sending
  context.roomRegistry.broadcast(
    roomId,
    JSON.stringify({ type: "room_deleted", roomId } satisfies ServerMessage),
  );
  context.roomRegistry.evictRoom(roomId);

  return { room: deleted, userErrors: [] };
}
