import { getPrisma } from "./prisma.js";
import type { GlobalRole, User } from "../generated/prisma/client.js";

export function findUserByUsername(username: string): Promise<User | null> {
  return getPrisma().user.findUnique({
    where: { username: username.toLowerCase() },
  });
}

export function findUserById(id: string): Promise<User | null> {
  return getPrisma().user.findUnique({ where: { id } });
}

export async function findActiveUserById(id: string): Promise<User | null> {
  const user = await findUserById(id);
  return user && user.isActive ? user : null;
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

export function countActiveAdmins(): Promise<number> {
  return getPrisma().user.count({
    where: { globalRole: "ADMIN", isActive: true },
  });
}

export async function isLastActiveAdmin(user: User): Promise<boolean> {
  if (user.globalRole !== "ADMIN" || !user.isActive) return false;
  const activeAdmins = await countActiveAdmins();
  return activeAdmins <= 1;
}

export function updateGlobalRole(
  userId: string,
  role: GlobalRole,
): Promise<User> {
  return getPrisma().user.update({
    where: { id: userId },
    data: { globalRole: role },
  });
}

export function deactivateUserById(userId: string): Promise<User> {
  return getPrisma().user.update({
    where: { id: userId },
    data: { isActive: false },
  });
}
