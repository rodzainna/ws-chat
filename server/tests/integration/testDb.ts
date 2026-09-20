import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Client } from "pg";

const execFileAsync = promisify(execFile);

const ADMIN_DATABASE_URL = "postgresql://dev:dev@localhost:5432/postgres";
export const TEST_DATABASE_NAME = "ws_chat_test";
export const TEST_DATABASE_URL = `postgresql://dev:dev@localhost:5432/${TEST_DATABASE_NAME}`;

async function databaseExists(): Promise<boolean> {
  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DATABASE_NAME],
    );
    return result.rowCount !== null && result.rowCount > 0;
  } finally {
    await client.end();
  }
}

async function createDatabase(): Promise<void> {
  const client = new Client({ connectionString: ADMIN_DATABASE_URL });
  await client.connect();
  try {
    // identifiers can't be parameterized; this is a constant
    await client.query(`CREATE DATABASE "${TEST_DATABASE_NAME}"`);
  } finally {
    await client.end();
  }
}

export async function ensureTestDatabaseMigrated(): Promise<void> {
  if (!(await databaseExists())) {
    await createDatabase();
  }
  await execFileAsync("npx", ["prisma", "migrate", "deploy"], {
    cwd: new URL("../..", import.meta.url).pathname,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}

export async function promoteToAdmin(userId: string): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query('UPDATE "users" SET "globalRole" = $1 WHERE id = $2', [
      "ADMIN",
      userId,
    ]);
  } finally {
    await client.end();
  }
}

export async function truncateAllTables(): Promise<void> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    await client.query(
      `TRUNCATE TABLE "mentions", "messages", "room_members", "rooms", "refresh_tokens", "users" CASCADE`,
    );
  } finally {
    await client.end();
  }
}
