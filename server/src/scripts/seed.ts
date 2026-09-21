import "dotenv/config";
import { getPrisma, disconnectPrisma } from "../db/prisma.js";
import { hashPassword } from "../auth/password.js";
import { extractMentionedUsernames } from "../messages/mentions.js";
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

type SeedMessage = {
  author: "alice" | "bob" | "dave";
  text: string;
  edited?: boolean;
  deleted?: boolean;
};

const GENERAL_CONVERSATION: SeedMessage[] = [
  {
    author: "alice",
    text: "morning everyone! kicking off the week — anyone blocked on anything before standup?",
  },
  {
    author: "bob",
    text: "morning! nothing blocking, just picking back up the search filters work",
  },
  {
    author: "dave",
    text: "morning. I'll be in and out today, doctor's appointment at 2",
  },
  { author: "alice", text: "no worries, we'll keep it quick" },
  {
    author: "bob",
    text: "quick q — is the staging DB back up? couldn't connect last night",
  },
  { author: "dave", text: "yeah should be, restarted it around 8" },
  { author: "bob", text: "confirmed, working now, thanks" },
  {
    author: "alice",
    text: "cool. priorities this week: finish the search filters, get the export button shipped, and start looking at that slow query on the reports page",
  },
  {
    author: "dave",
    text: "I can take the slow query one, I've got a theory on it already",
  },
  { author: "alice", text: "go for it" },
  {
    author: "bob",
    text: "the export button — is that CSV only or do we need PDF too?",
  },
  { author: "alice", text: "just CSV for now, PDF got pushed to next quarter" },
  { author: "bob", text: "easy, should have that done by wednesday" },
  {
    author: "dave",
    text: "@bob heads up the export endpoint currently times out on large datasets, might be worth checking before you wire up the button",
  },
  {
    author: "bob",
    text: "oh good catch, will test with the big dataset first",
  },
  { author: "alice", text: "anyone hear back from the design review yet?" },
  { author: "dave", text: "not yet, I'll ping them after lunch" },
  {
    author: "bob",
    text: "the new empty state mockups looked really clean btw",
  },
  { author: "alice", text: "agreed, way better than what we have now" },
  {
    author: "bob",
    text: "starting on the filters now, will post progress later",
  },
  { author: "dave", text: "sounds good" },
  {
    author: "alice",
    text: "lunch at the usual place around 12:30 if anyone wants to join",
  },
  { author: "bob", text: "I'm in" },
  {
    author: "dave",
    text: "can't today, doctor's appointment, next time though",
  },
  { author: "alice", text: "no worries!" },
  {
    author: "bob",
    text: "filters are coming along, price range slider is working",
  },
  { author: "alice", text: "nice, screenshot when you get a sec?" },
  { author: "bob", text: "will do after I clean it up a bit" },
  {
    author: "dave",
    text: "back from the appointment, digging into the slow query now",
  },
  { author: "alice", text: "let me know what you find" },
  {
    author: "dave",
    text: "looks like it's missing an index on the join, testing a fix locally",
  },
  { author: "bob", text: "oh nice, that would explain a lot" },
  { author: "alice", text: "great find" },
  {
    author: "dave",
    text: "wrapping up for the day, will finish the index fix tomorrow morning",
  },

  { author: "alice", text: "morning! dave how'd the index fix go?" },
  {
    author: "dave",
    text: "tested it locally, query went from ~4s to under 200ms. writing the migration now",
  },
  { author: "bob", text: "that's a huge improvement" },
  {
    author: "dave",
    text: "yeah, missing index on the join, same pattern as last time",
  },
  { author: "alice", text: "love it when the fix is that clean" },
  {
    author: "bob",
    text: "put a filters screenshot in the design doc, take a look when you get a chance",
  },
  { author: "alice", text: "looks great! love the price range slider" },
  { author: "bob", text: "thanks, still need to wire up the reset button" },
  { author: "dave", text: "migration's ready, planning to deploy after lunch" },
  { author: "alice", text: "sounds good, ping the channel before you do" },
  { author: "dave", text: "will do" },
  { author: "bob", text: "coffee machine is broken again lol" },
  { author: "alice", text: "of course it is" },
  { author: "bob", text: "third time this month" },
  { author: "dave", text: "someone should just buy a new one at this point" },
  { author: "alice", text: "I'll mention it to facilities again" },
  {
    author: "dave",
    text: "deploying the index fix now, might see a brief blip on the reports page",
  },
  { author: "bob", text: "noted" },
  { author: "dave", text: "deploy's done, reports page loading fast now" },
  { author: "alice", text: "confirmed, way snappier" },
  { author: "bob", text: "nice work @dave" },
  { author: "dave", text: "thanks, was bugging me for a while" },
  { author: "alice", text: "filters still on track for tomorrow?" },
  { author: "bob", text: "yep, just the reset button left" },
  {
    author: "dave",
    text: "I'm going to start looking at that export timeout bob flagged",
  },
  {
    author: "bob",
    text: "appreciate it, wasn't looking forward to debugging that one",
  },
  { author: "alice", text: "team effort" },
  {
    author: "dave",
    text: "looks like it's loading everything into memory before writing the csv, streaming it should fix it",
  },
  { author: "bob", text: "makes sense, that'll scale way better too" },
  { author: "alice", text: "go for it, no rush on that one though" },
  { author: "dave", text: "yeah I'll pick it up properly tomorrow" },
  { author: "bob", text: "reset button done, filters are basically finished" },
  { author: "alice", text: "awesome, I'll take a look in the morning" },

  { author: "alice", text: "morning! filters look great bob, nice work" },
  {
    author: "bob",
    text: "thanks! just cleaning up a couple edge cases with empty results",
  },
  { author: "dave", text: "morning, starting on the csv streaming fix now" },
  {
    author: "alice",
    text: "anyone up for pairing later? want to look at the reports page layout with someone",
  },
  { author: "bob", text: "I can do 2pm" },
  { author: "alice", text: "works for me" },
  {
    author: "dave",
    text: "csv streaming is trickier than expected, the current library doesn't support it well",
  },
  { author: "bob", text: "could switch libraries or write it by hand?" },
  {
    author: "dave",
    text: "leaning towards writing it by hand, it's not that much code",
  },
  { author: "alice", text: "your call, you know that code best" },
  { author: "dave", text: "going with the manual approach" },
  {
    author: "bob",
    text: "quick heads up, seeing some weird behavior on the filters when you clear all of them at once",
  },
  { author: "dave", text: "what kind of weird" },
  {
    author: "bob",
    text: "it flashes the old results for a second before clearing, probably a state ordering thing",
  },
  {
    author: "bob",
    text: "found it, was updating the UI before the request resolved, fixed now",
  },
  { author: "alice", text: "nice, that was fast" },
  {
    author: "dave",
    text: "csv streaming is working locally now, testing with the big dataset",
  },
  { author: "alice", text: "how's it looking?" },
  { author: "dave", text: "way better, doesn't even blip memory usage now" },
  { author: "bob", text: "love that" },
  {
    author: "alice",
    text: "pairing session was helpful, reports page layout mostly figured out",
  },
  { author: "bob", text: "yeah that was good, makes way more sense now" },
  {
    author: "dave",
    text: "heads up — seeing elevated error rates on login in the last 10 minutes",
  },
  { author: "alice", text: "on it, checking now" },
  {
    author: "dave",
    text: "looks like the rate limiter, might be misconfigured",
  },
  {
    author: "alice",
    text: "confirmed, window was way too short, pushing a fix",
  },
  { author: "bob", text: "yikes, anyone actually affected?" },
  {
    author: "alice",
    text: "a handful of people got rate limited unfairly, nothing worse than that",
  },
  { author: "dave", text: "fix deployed, error rate back to normal" },
  { author: "alice", text: "thanks for catching that quick @dave" },
  { author: "dave", text: "no problem, saw it in the logs right away" },
  { author: "bob", text: "good save" },
  {
    author: "alice",
    text: "writing up a quick note on what happened for the record",
  },

  {
    author: "alice",
    text: "morning! demo's at 3 today, let's make sure everything's in a good state before then",
  },
  {
    author: "bob",
    text: "filters are solid, I'll do one more pass this morning",
  },
  {
    author: "dave",
    text: "csv export is ready too, streaming fix is deployed",
  },
  { author: "alice", text: "awesome, feeling good about this one" },
  { author: "bob", text: "should we mention the reports page speed fix too?" },
  { author: "alice", text: "definitely, that's a good win to show" },
  {
    author: "dave",
    text: "I'll put together a before/after on the query time",
  },
  { author: "alice", text: "perfect" },
  { author: "bob", text: "running through the demo flow now just to be safe" },
  {
    author: "dave",
    text: "same, want to make sure the export doesn't choke on stage data",
  },
  { author: "bob", text: "all good on my end" },
  { author: "dave", text: "export tested with 50k rows, under 3 seconds" },
  { author: "alice", text: "great, that should cover it" },
  {
    author: "bob",
    text: "getting a little nervous, it's been a while since I demoed something",
  },
  { author: "alice", text: "you'll be fine, the work speaks for itself" },
  {
    author: "dave",
    text: "seriously, this is one of the stronger weeks we've had",
  },
  { author: "bob", text: "thanks, appreciate that" },
  {
    author: "alice",
    text: "demo went really well, good questions from everyone",
  },
  { author: "bob", text: "that felt good, glad the filters landed well" },
  {
    author: "dave",
    text: "the query speed comparison got a good reaction too",
  },
  { author: "alice", text: "yeah people were surprised it was that dramatic" },
  { author: "bob", text: "nice way to end the week" },
  {
    author: "dave",
    text: "still have tomorrow before the week actually ends haha",
  },
  { author: "alice", text: "true, don't get ahead of ourselves" },
  { author: "bob", text: "what's left before we wrap the sprint?" },
  { author: "alice", text: "just a few small polish items, nothing major" },
  {
    author: "dave",
    text: "I want to double check the csv export handles special characters properly",
  },
  { author: "bob", text: "good call, I'll test that with some sample data" },
  {
    author: "alice",
    text: "let's regroup tomorrow morning and plan next sprint too",
  },
  { author: "bob", text: "sounds good" },
  {
    author: "dave",
    text: "anyone want to grab a coffee, the machine's fixed by the way",
  },
  { author: "alice", text: "finally" },
  { author: "bob", text: "yes please" },

  { author: "alice", text: "morning, feeling good about how this week's gone" },
  {
    author: "bob",
    text: "csv export handled the special characters fine, no issues",
  },
  {
    author: "dave",
    text: "great, that was the last thing on my list for this sprint",
  },
  {
    author: "alice",
    text: "nice, feels like we're closing this one out clean",
  },
  { author: "bob", text: "retro at 11 still good for everyone?" },
  { author: "dave", text: "works for me" },
  { author: "alice", text: "yep" },
  {
    author: "dave",
    text: "retro thoughts: the pairing session on the reports page was really useful, more of that would be good",
  },
  {
    author: "bob",
    text: "agreed, caught that filter bug way faster than I would have solo",
  },
  { author: "alice", text: "noted, let's plan for more pairing next sprint" },
  {
    author: "bob",
    text: "also the incident on wednesday, glad it got caught fast but the rate limiter config should probably have a test around it",
  },
  { author: "dave", text: "good point, I'll add one" },
  { author: "alice", text: "anything that didn't go well?" },
  {
    author: "bob",
    text: "csv streaming took longer than expected, but the result was worth it",
  },
  {
    author: "dave",
    text: "yeah, would've estimated that smaller if I'd known the library limitation upfront",
  },
  { author: "alice", text: "fair, hard to know that in advance though" },
  { author: "dave", text: "true" },
  { author: "alice", text: "good retro, appreciate the honesty" },
  { author: "bob", text: "anyone have weekend plans?" },
  {
    author: "alice",
    text: "just relaxing, maybe a hike if the weather holds up",
  },
  { author: "dave", text: "visiting my parents, nothing exciting" },
  { author: "bob", text: "I'm finally getting around to that book club book" },
  { author: "alice", text: "oh right, how is it?" },
  {
    author: "bob",
    text: "actually really good so far, didn't expect to like it this much",
  },
  { author: "dave", text: "which one is it again?" },
  {
    author: "bob",
    text: "the one about the lighthouse keeper, forget the exact title",
  },
  { author: "alice", text: "I remember that one being recommended a lot" },
  { author: "bob", text: "yeah I can see why", deleted: true },
  { author: "dave", text: "alright, signing off, great week everyone" },
  { author: "alice", text: "same, nice work this week team" },
  { author: "bob", text: "thanks everyone, have a good weekend" },
  { author: "alice", text: "you too!" },
  { author: "dave", text: "see you next week" },

  {
    author: "alice",
    text: "morning! new week, new sprint — let's plan priorities",
  },
  { author: "bob", text: "morning, well rested and ready" },
  { author: "dave", text: "morning all" },
  {
    author: "alice",
    text: "top of the list: the notification preferences work and starting on the mobile layout pass",
  },
  { author: "bob", text: "I can take notification preferences" },
  { author: "dave", text: "I'll start scoping the mobile layout work today" },
  {
    author: "alice",
    text: "sounds good, I'll handle the admin panel improvements we talked about",
  },
  {
    author: "bob",
    text: "notification preferences — is that email, in-app, or both?",
  },
  { author: "alice", text: "both eventually, but let's start with in-app" },
  { author: "bob", text: "makes sense, smaller scope to start" },
  {
    author: "dave",
    text: "mobile layout scoping is going to take most of today, there's more edge cases than I expected",
  },
  { author: "alice", text: "take your time on it, better to plan it properly" },
  {
    author: "bob",
    text: "in-app notification preferences UI is coming together",
    edited: true,
  },
  { author: "dave", text: "nice, what's it look like" },
  {
    author: "bob",
    text: "just a simple toggle list for now, per notification type",
  },
  { author: "dave", text: "clean, I like it" },
  {
    author: "alice",
    text: "@bob can you loop me in before you wire up the backend for that? want to make sure it lines up with the admin panel changes",
  },
  {
    author: "bob",
    text: "for sure, will grab you before I start on that part",
  },
  { author: "dave", text: "mobile layout scoping done, writing it up now" },
  { author: "alice", text: "nice, send it over when it's ready" },
  { author: "dave", text: "just posted it in the docs folder" },
  { author: "alice", text: "taking a look now" },
  {
    author: "alice",
    text: "this is solid, good breakdown of the trickier screens",
    edited: true,
  },
  {
    author: "dave",
    text: "thanks, the room list and the chat view itself are the two that'll need the most care",
  },
  { author: "bob", text: "yeah the sidebar especially, lots going on there" },
  {
    author: "dave",
    text: "exactly, that's priority one once we start building",
  },
  { author: "alice", text: "let's kick that off properly tomorrow" },
  { author: "bob", text: "sounds good" },
  { author: "dave", text: "notification toggles are looking good bob" },
  { author: "bob", text: "thanks, wiring up the backend next" },
  { author: "alice", text: "great start to the week all around" },
  { author: "bob", text: "agreed, feels like a good pace" },
  { author: "dave", text: "same, let's keep it up" },
  {
    author: "alice",
    text: "alright, heading out for the day — great work everyone",
  },
];

const CONVERSATION_DAY_SIZES = [34, 33, 33, 33, 33, 34];

if (
  CONVERSATION_DAY_SIZES.reduce((a, b) => a + b, 0) !==
  GENERAL_CONVERSATION.length
) {
  throw new Error(
    "CONVERSATION_DAY_SIZES doesn't add up to GENERAL_CONVERSATION.length — a message was added/removed from a day block without updating its count",
  );
}

function conversationTimestamp(index: number): Date {
  let dayOffset = CONVERSATION_DAY_SIZES.length - 1;
  let withinDay = index;
  let messagesThisDay = CONVERSATION_DAY_SIZES[0];
  for (const size of CONVERSATION_DAY_SIZES) {
    if (withinDay < size) {
      messagesThisDay = size;
      break;
    }
    withinDay -= size;
    dayOffset--;
  }
  const fraction = messagesThisDay > 1 ? withinDay / (messagesThisDay - 1) : 0;

  const day = new Date();
  day.setHours(9, 0, 0, 0);
  day.setDate(day.getDate() - dayOffset);
  return new Date(day.getTime() + fraction * 9 * 60 * 60 * 1000);
}

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

async function resetGeneralConversation(
  roomId: string,
  authorsByUsername: Record<string, { id: string }>,
): Promise<void> {
  await getPrisma().mention.deleteMany({ where: { message: { roomId } } });
  await getPrisma().message.deleteMany({ where: { roomId } });

  for (let i = 0; i < GENERAL_CONVERSATION.length; i++) {
    const entry = GENERAL_CONVERSATION[i];
    const createdAt = conversationTimestamp(i);
    const mentionedUserIds = extractMentionedUsernames(entry.text)
      .map((username) => authorsByUsername[username]?.id)
      .filter((id): id is string => id !== undefined);

    await getPrisma().message.create({
      data: {
        roomId,
        userId: authorsByUsername[entry.author].id,
        content: entry.text,
        createdAt,
        editedAt: entry.edited
          ? new Date(createdAt.getTime() + 3 * 60 * 1000)
          : undefined,
        deletedAt: entry.deleted
          ? new Date(createdAt.getTime() + 5 * 60 * 1000)
          : undefined,
        mentions:
          mentionedUserIds.length > 0
            ? {
                create: mentionedUserIds.map((mentionedUserId) => ({
                  mentionedUserId,
                })),
              }
            : undefined,
      },
    });
  }
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
  await resetGeneralConversation(general.id, core);
  console.log(`#general reseeded with ${GENERAL_CONVERSATION.length} messages`);

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
