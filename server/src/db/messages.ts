import { getPrisma } from "./prisma.js";
import type { Message } from "../generated/prisma/client.js";

export type MessageWithAuthor = Message & { user: { username: string } };

export function createMessage(input: {
  roomId: string;
  userId: string;
  content: string;
}): Promise<MessageWithAuthor> {
  return getPrisma().message.create({
    data: input,
    include: { user: { select: { username: true } } },
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
    include: { user: { select: { username: true } } },
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
