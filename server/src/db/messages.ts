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
  const { count } = await getPrisma().message.updateMany({
    where: { id, deletedAt: null },
    data: { content, editedAt: new Date() },
  });
  if (count !== 1) return null;
  return findMessageById(id);
}

export async function softDeleteMessage(id: string): Promise<Message | null> {
  const { count } = await getPrisma().message.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (count !== 1) return null;
  return findMessageById(id);
}
