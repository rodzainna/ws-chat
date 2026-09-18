import { getPrisma } from "./prisma.js";
import type { Message } from "../generated/prisma/client.js";

export type MessageWithAuthor = Message & {
  user: { username: string };
  mentions: { user: { username: string } }[];
};

const AUTHOR_AND_MENTIONS_INCLUDE = {
  user: { select: { username: true } },
  mentions: { include: { user: { select: { username: true } } } },
} as const;

export function createMessage(input: {
  roomId: string;
  userId: string;
  content: string;
  mentionedUserIds: string[];
}): Promise<MessageWithAuthor> {
  return getPrisma().message.create({
    data: {
      roomId: input.roomId,
      userId: input.userId,
      content: input.content,
      mentions: {
        create: input.mentionedUserIds.map((mentionedUserId) => ({
          mentionedUserId,
        })),
      },
    },
    include: AUTHOR_AND_MENTIONS_INCLUDE,
  });
}

export function findMessageById(id: string): Promise<Message | null> {
  return getPrisma().message.findUnique({ where: { id } });
}

export function findMessagesPage(input: {
  roomId: string;
  take: number;
  afterId?: string;
}): Promise<MessageWithAuthor[]> {
  return getPrisma().message.findMany({
    where: { roomId: input.roomId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.take,
    include: AUTHOR_AND_MENTIONS_INCLUDE,
    ...(input.afterId ? { cursor: { id: input.afterId }, skip: 1 } : {}),
  });
}

// deletedAt: null in the WHERE closes the race with a concurrent delete, and
// updateManyAndReturn reads the row back in the same statement
export async function editMessage(
  id: string,
  content: string,
): Promise<Message | null> {
  const [updated] = await getPrisma().message.updateManyAndReturn({
    where: { id, deletedAt: null },
    data: { content, editedAt: new Date() },
  });
  return updated ?? null;
}

export async function softDeleteMessage(id: string): Promise<Message | null> {
  const [updated] = await getPrisma().message.updateManyAndReturn({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return updated ?? null;
}
