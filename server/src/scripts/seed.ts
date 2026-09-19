import "dotenv/config";
import { getPrisma, disconnectPrisma } from "../db/prisma.js";
import { hashPassword } from "../auth/password.js";
import type { GlobalRole } from "../generated/prisma/client.js";

const CORE_USERS: {
  username: string;
  email: string;
  globalRole: GlobalRole;
}[] = [
  { username: "alice", email: "alice@example.com", globalRole: "USER" },
  { username: "bob", email: "bob@example.com", globalRole: "USER" },
  { username: "carol", email: "carol@example.com", globalRole: "RESTRICTED" },
  { username: "dave", email: "dave@example.com", globalRole: "ADMIN" },
  {
    username: "superadmin",
    email: "superadmin@app.com",
    globalRole: "ADMIN",
  },
];

const EXTRA_USERNAMES = [
  "eve",
  "frank",
  "grace",
  "hank",
  "ivy",
  "jack",
  "kate",
  "leo",
  "mia",
  "nick",
  "olivia",
  "pete",
  "quinn",
  "rose",
  "sam",
  "tina",
  "uma",
  "vince",
  "wendy",
  "xander",
  "yara",
  "zack",
];

const EXTRA_ROOMS: { name: string; isPrivate: boolean }[] = [
  { name: "engineering", isPrivate: false },
  { name: "design", isPrivate: false },
  { name: "product", isPrivate: false },
  { name: "marketing", isPrivate: false },
  { name: "sales", isPrivate: false },
  { name: "support", isPrivate: false },
  { name: "random", isPrivate: false },
  { name: "announcements", isPrivate: false },
  { name: "watercooler", isPrivate: false },
  { name: "book-club", isPrivate: false },
  { name: "gaming", isPrivate: false },
  { name: "events", isPrivate: false },
  { name: "finance", isPrivate: true },
  { name: "hr", isPrivate: true },
  { name: "legal", isPrivate: true },
  { name: "incidents", isPrivate: true },
  { name: "exec-staff", isPrivate: true },
  { name: "security", isPrivate: true },
];

const DEMO_PASSWORD = "testpass123";

async function upsertUser(
  username: string,
  email: string,
  globalRole: GlobalRole,
  passwordHash: string,
) {
  return getPrisma().user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      email,
      passwordHash,
      globalRole,
    },
  });
}

async function ensureWelcomeMessage(
  roomId: string,
  authorId: string,
  content: string,
) {
  const existing = await getPrisma().message.findFirst({ where: { roomId } });
  if (existing) return;
  await getPrisma().message.create({
    data: { roomId, userId: authorId, content },
  });
}

async function main() {
  const prisma = getPrisma();
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const core: Record<string, { id: string }> = {};
  for (const { username, email, globalRole } of CORE_USERS) {
    core[username] = await upsertUser(
      username,
      email,
      globalRole,
      passwordHash,
    );
  }

  const extras = [];
  for (const username of EXTRA_USERNAMES) {
    extras.push(
      await upsertUser(
        username,
        `${username}@example.com`,
        "USER",
        passwordHash,
      ),
    );
  }
  console.log(`Users ready: ${CORE_USERS.length + extras.length} total`);

  const general = await prisma.room.upsert({
    where: { name: "general" },
    update: {},
    create: {
      name: "general",
      isPrivate: false,
      createdBy: core.alice.id,
      members: {
        create: [
          { userId: core.alice.id, role: "OWNER" },
          { userId: core.bob.id, role: "MEMBER" },
          { userId: core.dave.id, role: "MEMBER" },
          { userId: core.superadmin.id, role: "MEMBER" },
        ],
      },
    },
  });
  await ensureWelcomeMessage(general.id, core.alice.id, "Welcome to #general!");

  const leadership = await prisma.room.upsert({
    where: { name: "leadership" },
    update: {},
    create: {
      name: "leadership",
      isPrivate: true,
      createdBy: core.alice.id,
      members: {
        create: [
          { userId: core.alice.id, role: "OWNER" },
          { userId: core.carol.id, role: "MEMBER" },
        ],
      },
    },
  });
  await ensureWelcomeMessage(
    leadership.id,
    core.alice.id,
    "Welcome to #leadership!",
  );

  const allUsers = [...Object.values(core), ...extras];
  let roomIndex = 0;
  for (const { name, isPrivate } of EXTRA_ROOMS) {
    const creator = allUsers[roomIndex % allUsers.length];
    const room = await prisma.room.upsert({
      where: { name },
      update: {},
      create: {
        name,
        isPrivate,
        createdBy: creator.id,
        members: { create: { userId: creator.id, role: "OWNER" } },
      },
    });

    const memberCount = 4;
    for (let i = 1; i <= memberCount; i++) {
      const member = allUsers[(roomIndex + i * 3) % allUsers.length];
      if (member.id === creator.id) continue;
      await prisma.roomMember.upsert({
        where: { roomId_userId: { roomId: room.id, userId: member.id } },
        update: {},
        create: { roomId: room.id, userId: member.id, role: "MEMBER" },
      });
    }

    await ensureWelcomeMessage(room.id, creator.id, `Welcome to #${name}!`);
    roomIndex++;
  }
  console.log(`Rooms ready: ${EXTRA_ROOMS.length + 2} total`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void disconnectPrisma());
