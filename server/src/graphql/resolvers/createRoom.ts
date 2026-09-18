import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import { validateRoomName } from "../../rooms/validation.js";
import { createRoomWithOwner } from "../../db/rooms.js";
import { getViolatedUniqueField } from "../../db/prismaErrors.js";
import { Prisma, type Room } from "../../generated/prisma/client.js";
import type { GraphQLContext } from "../context.js";
import { toUserError, type GraphQLUserError } from "../userErrors.js";

type CreateRoomInput = { name: string; isPrivate: boolean };
type CreateRoomPayload = {
  room: Room | null;
  userErrors: GraphQLUserError[];
};

export async function createRoom(
  _parent: unknown,
  { input }: { input: CreateRoomInput },
  context: GraphQLContext,
): Promise<CreateRoomPayload> {
  const user = await requireActiveUser(context);

  if (user.globalRole === "RESTRICTED") {
    throw new GraphQLError("Restricted users cannot create rooms", {
      extensions: { code: "FORBIDDEN" },
    });
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
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
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
