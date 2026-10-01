import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebSocket } from "ws";
import { ConnectionRegistry } from "./connectionRegistry.js";

function fakeSocket() {
  return { OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() };
}
const asWs = (s: ReturnType<typeof fakeSocket>) => s as unknown as WebSocket;

describe("ConnectionRegistry", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("disconnects only the sockets of the given session", () => {
    const registry = new ConnectionRegistry();
    const tab = fakeSocket();
    const phone = fakeSocket();
    registry.register("alice", "laptop", asWs(tab));
    registry.register("alice", "phone", asWs(phone));

    expect(registry.disconnectSession("laptop", "logged_out")).toBe(true);

    expect(tab.close).toHaveBeenCalled();
    expect(phone.close).not.toHaveBeenCalled();
  });

  it("rejects a late handshake for a logged-out session despite an old user entry", () => {
    const registry = new ConnectionRegistry();
    registry.disconnectUser("alice", "deactivated");
    vi.advanceTimersByTime(6000);
    registry.disconnectSession("laptop", "logged_out");

    const late = fakeSocket();
    expect(registry.register("alice", "laptop", asWs(late))).toBe(false);
    expect(late.close).toHaveBeenCalledWith(4001, "logged_out");
  });

  it("registers a socket without a session (pre-session token)", () => {
    const registry = new ConnectionRegistry();
    expect(registry.register("alice", null, asWs(fakeSocket()))).toBe(true);
    expect(registry.isOnline("alice")).toBe(true);
  });
});
