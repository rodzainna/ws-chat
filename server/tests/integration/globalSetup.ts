import { ensureTestDatabaseMigrated } from "./testDb.js";

export default async function setup(): Promise<void> {
  await ensureTestDatabaseMigrated();
}
