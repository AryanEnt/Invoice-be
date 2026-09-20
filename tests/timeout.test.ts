import { describe, expect, it } from "vitest";
import { withTimeout } from "../src/lib/timeout.js";

describe("withTimeout", () => {
  it("rejects when the operation exceeds the limit", async () => {
    await expect(
      withTimeout(new Promise(() => undefined), 20, "test-op"),
    ).rejects.toThrow(/timed out/);
  });
});
