import { getPrisma } from "./prisma.js";
import type { User } from "../generated/prisma/client.js";

export function findUserByUsername(username: string): Promise<User | null> {
  return getPrisma().user.findUnique({
    where: { username: username.toLowerCase() },
  });
}

export function createUser(input: {
  username: string;
  email: string;
  passwordHash: string;
}): Promise<User> {
  return getPrisma().user.create({
    data: {
      username: input.username.toLowerCase(),
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
    },
  });
}
