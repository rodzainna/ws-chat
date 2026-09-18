import { getPrisma } from "./prisma.js";
import type { Prisma, GlobalRole, User } from "../generated/prisma/client.js";

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

export type GuardedUpdateResult =
  { blocked: true; user: null } | { blocked: false; user: User | null };

// "never drop to zero active admins" has to hold when two requests demote
// two different admins at once; each row lock alone doesn't cover the other
// admin. SERIALIZABLE + retry only caught the race 1 time in 8 under load,
// so every caller locks the whole active-admin set FOR UPDATE before deciding.
async function guardedAdminUpdate(
  userId: string,
  removesFromActiveAdmins: boolean,
  applyUpdate: (tx: Prisma.TransactionClient, userId: string) => Promise<User>,
): Promise<GuardedUpdateResult> {
  return getPrisma().$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) return { blocked: false, user: null };

    const isLiveRisk =
      removesFromActiveAdmins &&
      target.globalRole === "ADMIN" &&
      target.isActive;
    if (isLiveRisk) {
      const lockedActiveAdmins = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "users" WHERE "globalRole" = 'ADMIN' AND "isActive" = true FOR UPDATE
      `;
      if (lockedActiveAdmins.length <= 1) {
        return { blocked: true, user: null };
      }
    }

    const user = await applyUpdate(tx, userId);
    return { blocked: false, user };
  });
}

export function updateGlobalRoleGuarded(
  userId: string,
  role: GlobalRole,
): Promise<GuardedUpdateResult> {
  return guardedAdminUpdate(userId, role !== "ADMIN", (tx, id) =>
    tx.user.update({ where: { id }, data: { globalRole: role } }),
  );
}

export function deactivateUserByIdGuarded(
  userId: string,
): Promise<GuardedUpdateResult> {
  return guardedAdminUpdate(userId, true, (tx, id) =>
    tx.user.update({ where: { id }, data: { isActive: false } }),
  );
}

export function findUsersPage(input: {
  take: number;
  afterId?: string;
}): Promise<User[]> {
  return getPrisma().user.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: input.take,
    ...(input.afterId ? { cursor: { id: input.afterId }, skip: 1 } : {}),
  });
}
