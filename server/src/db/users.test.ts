import { describe, it, expect, vi, beforeEach } from "vitest";

const txUserFindUnique = vi.fn();
const txUserUpdate = vi.fn();
const txQueryRaw = vi.fn();
const mockTx = {
  user: { findUnique: txUserFindUnique, update: txUserUpdate },
  $queryRaw: txQueryRaw,
};
const transaction = vi.fn((fn: (tx: typeof mockTx) => unknown) => fn(mockTx));

vi.mock("./prisma.js", () => ({
  getPrisma: () => ({ $transaction: transaction }),
}));

let superAdminUsername: string | null = null;
vi.mock("../env.js", () => ({
  getSuperAdminUsername: () => superAdminUsername,
}));

const { updateGlobalRoleGuarded, deactivateUserByIdGuarded } =
  await import("./users.js");

describe("updateGlobalRoleGuarded", () => {
  beforeEach(() => {
    txUserFindUnique.mockReset();
    txUserUpdate.mockReset();
    txQueryRaw.mockReset();
    superAdminUsername = null;
  });

  it("returns a null user without touching the row set when the target doesn't exist", async () => {
    txUserFindUnique.mockResolvedValue(null);

    const result = await updateGlobalRoleGuarded("missing-user", "USER");

    expect(result).toEqual({ blocked: false, user: null });
    expect(txQueryRaw).not.toHaveBeenCalled();
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("blocks changing the designated superadmin's role, before even checking the active-admin count", async () => {
    superAdminUsername = "root";
    txUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "root",
      globalRole: "ADMIN",
      isActive: true,
    });

    const result = await updateGlobalRoleGuarded("u1", "USER");

    expect(result).toEqual({
      blocked: true,
      user: null,
      reason: "superadmin",
    });
    expect(txQueryRaw).not.toHaveBeenCalled();
  });

  it("blocks demoting the last active admin", async () => {
    txUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "alice",
      globalRole: "ADMIN",
      isActive: true,
    });
    txQueryRaw.mockResolvedValue([{ id: "u1" }]);

    const result = await updateGlobalRoleGuarded("u1", "USER");

    expect(result).toEqual({
      blocked: true,
      user: null,
      reason: "last-active-admin",
    });
    expect(txUserUpdate).not.toHaveBeenCalled();
  });

  it("allows demoting an admin when another active admin remains", async () => {
    txUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "alice",
      globalRole: "ADMIN",
      isActive: true,
    });
    txQueryRaw.mockResolvedValue([{ id: "u1" }, { id: "u2" }]);
    const updated = { id: "u1", globalRole: "USER" };
    txUserUpdate.mockResolvedValue(updated);

    const result = await updateGlobalRoleGuarded("u1", "USER");

    expect(result).toEqual({ blocked: false, user: updated });
  });

  it("doesn't even check the active-admin count for a change that isn't a demotion", async () => {
    txUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "bob",
      globalRole: "USER",
      isActive: true,
    });
    const updated = { id: "u1", globalRole: "ADMIN" };
    txUserUpdate.mockResolvedValue(updated);

    const result = await updateGlobalRoleGuarded("u1", "ADMIN");

    expect(txQueryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({ blocked: false, user: updated });
  });

  it("doesn't block demoting an already-inactive admin (they don't count toward the live total)", async () => {
    txUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "alice",
      globalRole: "ADMIN",
      isActive: false,
    });
    const updated = { id: "u1", globalRole: "USER" };
    txUserUpdate.mockResolvedValue(updated);

    const result = await updateGlobalRoleGuarded("u1", "USER");

    expect(txQueryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({ blocked: false, user: updated });
  });
});

describe("deactivateUserByIdGuarded", () => {
  beforeEach(() => {
    txUserFindUnique.mockReset();
    txUserUpdate.mockReset();
    txQueryRaw.mockReset();
    superAdminUsername = null;
  });

  it("blocks deactivating the last active admin", async () => {
    txUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "alice",
      globalRole: "ADMIN",
      isActive: true,
    });
    txQueryRaw.mockResolvedValue([{ id: "u1" }]);

    const result = await deactivateUserByIdGuarded("u1");

    expect(result).toEqual({
      blocked: true,
      user: null,
      reason: "last-active-admin",
    });
  });

  it("blocks deactivating the designated superadmin even with other admins active", async () => {
    superAdminUsername = "root";
    txUserFindUnique.mockResolvedValue({
      id: "u1",
      username: "root",
      globalRole: "ADMIN",
      isActive: true,
    });

    const result = await deactivateUserByIdGuarded("u1");

    expect(result).toEqual({
      blocked: true,
      user: null,
      reason: "superadmin",
    });
    expect(txQueryRaw).not.toHaveBeenCalled();
  });

  it("allows deactivating an ordinary (non-admin) user without checking admin count", async () => {
    txUserFindUnique.mockResolvedValue({
      id: "u2",
      username: "bob",
      globalRole: "USER",
      isActive: true,
    });
    const updated = { id: "u2", isActive: false };
    txUserUpdate.mockResolvedValue(updated);

    const result = await deactivateUserByIdGuarded("u2");

    expect(txQueryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({ blocked: false, user: updated });
  });
});
