import { describe, expect, it, vi } from "vitest";
import { acquireLock, releaseLock } from "../src/lib/redis-lock.js";

const setMock = vi.fn();
const evalMock = vi.fn();
const connectMock = vi.fn();

vi.mock("../src/lib/redis.js", () => ({
  getRedis: () => ({
    status: "ready",
    connect: connectMock,
    set: setMock,
    eval: evalMock,
  }),
}));

describe("redis locks", () => {
  it("acquires a lock with NX EX", async () => {
    setMock.mockResolvedValueOnce("OK");
    const result = await acquireLock("outinvoice:lock:invoice-send:abc", 30);
    expect(result.acquired).toBe(true);
    if (result.acquired) {
      expect(result.token).toBeTruthy();
    }
    expect(setMock).toHaveBeenCalledWith(
      "outinvoice:lock:invoice-send:abc",
      expect.any(String),
      "EX",
      30,
      "NX",
    );
  });

  it("does not release a lock owned by another token", async () => {
    await releaseLock("outinvoice:lock:invoice-send:abc", "token-a");
    expect(evalMock).toHaveBeenCalledWith(expect.any(String), 1, "outinvoice:lock:invoice-send:abc", "token-a");
  });
});
