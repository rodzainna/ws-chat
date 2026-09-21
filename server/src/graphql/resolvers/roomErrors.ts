import type {
  GlobalRole,
  Room,
  RoomMember,
} from "../../generated/prisma/client.js";
import type { GraphQLUserError } from "../userErrors.js";

export type RoomMutationPayload = {
  room: Room | null;
  userErrors: GraphQLUserError[];
};

export const ROOM_NOT_FOUND: GraphQLUserError = {
  field: ["roomId"],
  message: "Room not found",
};

export function isRoomOwnerOrAdmin(
  membership: RoomMember | null,
  user: { globalRole: GlobalRole },
): boolean {
  return membership?.role === "OWNER" || user.globalRole === "ADMIN";
}

export function canAddRoomMembers(user: { globalRole: GlobalRole }): boolean {
  return user.globalRole !== "RESTRICTED";
}
