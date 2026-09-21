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

export async function findMessagesPage(input: {
  roomId: string;
  take: number;
  beforeId?: string;
}): Promise<MessageWithAuthor[]> {
  const rows = await getPrisma().message.findMany({
    where: { roomId: input.roomId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.take,
    include: AUTHOR_AND_MENTIONS_INCLUDE,
    ...(input.beforeId ? { cursor: { id: input.beforeId }, skip: 1 } : {}),
  });
  return rows.reverse();
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

// separate from softDeleteMessage because updateManyAndReturn can't include
// one-to-many relations like mentions
export function findMessageWithAuthorById(
  id: string,
): Promise<MessageWithAuthor | null> {
  return getPrisma().message.findUnique({
    where: { id },
    include: AUTHOR_AND_MENTIONS_INCLUDE,
  });
}
