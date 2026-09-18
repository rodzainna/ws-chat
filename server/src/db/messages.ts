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

export function editMessage(id: string, content: string): Promise<Message> {
  return getPrisma().message.update({
    where: { id },
    data: { content, editedAt: new Date() },
  });
}

export function softDeleteMessage(id: string): Promise<Message> {
  return getPrisma().message.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}
