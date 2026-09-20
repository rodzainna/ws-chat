import { describe, it, expect, vi, beforeEach } from "vitest";

const findUnique = vi.fn();
vi.mock("./prisma.js", () => ({
  getPrisma: () => ({ roomMember: { findUnique } }),
}));

const { canAccessRoom } = await import("./rooms.js");

describe("canAccessRoom", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("denies access when there is no membership row", async () => {
    findUnique.mockResolvedValue(null);
    expect(await canAccessRoom("user-1", "room-1")).toBe(false);
  });

  it("denies access when the room has been soft-deleted", async () => {
    findUnique.mockResolvedValue({
      room: { deletedAt: new Date() },
      user: { isActive: true },
    });
    expect(await canAccessRoom("user-1", "room-1")).toBe(false);
  });

  it("denies access when the member's account is deactivated", async () => {
    findUnique.mockResolvedValue({
      room: { deletedAt: null },
      user: { isActive: false },
    });
    expect(await canAccessRoom("user-1", "room-1")).toBe(false);
  });

  it("grants access for an active member of a live room", async () => {
    findUnique.mockResolvedValue({
      room: { deletedAt: null },
      user: { isActive: true },
    });
    expect(await canAccessRoom("user-1", "room-1")).toBe(true);
  });

  it("looks up membership by the composite roomId/userId key", async () => {
    findUnique.mockResolvedValue(null);
    await canAccessRoom("user-1", "room-1");
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomId_userId: { roomId: "room-1", userId: "user-1" } },
      }),
    );
  });
});
