import type { Room } from "../../generated/prisma/client.js";
import type { GraphQLUserError } from "../userErrors.js";

export type RoomMutationPayload = {
  room: Room | null;
  userErrors: GraphQLUserError[];
};

export const ROOM_NOT_FOUND: GraphQLUserError = {
  field: ["roomId"],
  message: "Room not found",
};
