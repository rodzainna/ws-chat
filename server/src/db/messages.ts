import { getPrisma } from "./prisma.js";
import type { Message } from "../generated/prisma/client.js";

export function createMessage(input: {
  roomId: string;
  userId: string;
  content: string;
}): Promise<Message> {
  return getPrisma().message.create({ data: input });
}

export function findMessageById(id: string): Promise<Message | null> {
  return getPrisma().message.findUnique({ where: { id } });
}

export function findMessagesPage(input: {
  roomId: string;
  take: number;
  afterId?: string;
}): Promise<Message[]> {
  return getPrisma().message.findMany({
    where: { roomId: input.roomId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.take,
    ...(input.afterId ? { cursor: { id: input.afterId }, skip: 1 } : {}),
  });
}

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
