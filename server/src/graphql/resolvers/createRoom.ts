import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { validateRoomName } from "../../rooms/validation.js";
import { countRooms, createRoomWithOwner } from "../../db/rooms.js";
import { tryConsumeRoomCreationToken } from "../../rooms/rateLimit.js";
import { getMaxRooms } from "../../env.js";
import {
  getViolatedUniqueField,
  isUniqueConstraintViolation,
} from "../../db/prismaErrors.js";
import type { GraphQLContext } from "../context.js";
import { toUserError, type GraphQLUserError } from "../userErrors.js";
import type { RoomMutationPayload } from "./roomErrors.js";

type CreateRoomInput = { name: string; isPrivate: boolean };

const RATE_LIMITED: GraphQLUserError = {
  field: [],
  message: "Too many rooms created recently. Please try again later.",
};

const ROOM_CAP_REACHED: GraphQLUserError = {
  field: [],
  message: `Maximum number of rooms (${getMaxRooms()}) reached.`,
};

export async function createRoom(
  _parent: unknown,
  { input }: { input: CreateRoomInput },
  context: GraphQLContext,
): Promise<RoomMutationPayload> {
  const user = await requireActiveUser(context);

  if (user.globalRole === "RESTRICTED") {
    throw new GraphQLError("Restricted users cannot create rooms", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  if ((await countRooms()) >= getMaxRooms()) {
    return { room: null, userErrors: [ROOM_CAP_REACHED] };
  }

  if (!tryConsumeRoomCreationToken(user.id)) {
    return { room: null, userErrors: [RATE_LIMITED] };
  }

  const nameError = validateRoomName(input.name);
  if (nameError) {
    return { room: null, userErrors: [toUserError(nameError)] };
  }

  try {
    const room = await createRoomWithOwner({
      name: input.name.trim(),
      isPrivate: input.isPrivate,
      creatorId: user.id,
    });
    return { room, userErrors: [] };
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      const field = getViolatedUniqueField(err);
      return {
        room: null,
        userErrors: [
          {
            field: field ? [field] : [],
            message:
              field === "name"
                ? "Room name is already taken"
                : "That information is already in use",
          },
        ],
      };
    }
    throw err;
  }
}
