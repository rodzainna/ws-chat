import { GraphQLError } from "graphql";
import { requireActiveUser } from "../currentUser.js";
import {
  softDeleteMessage,
  findMessageWithAuthorById,
  type MessageWithAuthor,
} from "../../db/messages.js";
import type { GraphQLContext } from "../context.js";
import type { GraphQLUserError } from "../userErrors.js";
import type { ServerMessage } from "../../ws/messages.js";

type DeleteMessagePayload = {
  message: MessageWithAuthor | null;
  userErrors: GraphQLUserError[];
};

const MESSAGE_NOT_FOUND: GraphQLUserError = {
  field: ["messageId"],
  message: "Message not found",
};

export async function deleteMessage(
  _parent: unknown,
  { messageId }: { messageId: string },
  context: GraphQLContext,
): Promise<DeleteMessagePayload> {
  const caller = await requireActiveUser(context);

  if (caller.globalRole !== "ADMIN") {
    throw new GraphQLError("Only an admin can delete another user's message", {
      extensions: { code: "FORBIDDEN" },
    });
  }

  const deleted = await softDeleteMessage(messageId);
  if (!deleted) {
    return { message: null, userErrors: [MESSAGE_NOT_FOUND] };
  }

  context.roomRegistry.broadcast(
    deleted.roomId,
    JSON.stringify({
      type: "message_deleted",
      messageId: deleted.id,
    } satisfies ServerMessage),
  );

  const withAuthor = await findMessageWithAuthorById(messageId);
  return { message: withAuthor, userErrors: [] };
}
