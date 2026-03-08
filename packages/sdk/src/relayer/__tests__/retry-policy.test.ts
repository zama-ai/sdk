import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { retryTransient } from "../retry-policy";
import { EncryptionFailed } from "../../errors";

describe("retryTransient", () => {
  it("succeeds on first attempt", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.sync(() => {
        attempts++;
        return "ok";
      }),
    );
    const result = await Effect.runPromise(program);
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries on transient error and succeeds", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.suspend(() => {
        attempts++;
        if (attempts < 2) {
          return Effect.fail(new EncryptionFailed({ message: "timed out" }));
        }
        return Effect.succeed("ok");
      }),
    );
    const result = await Effect.runPromise(program);
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry non-transient errors", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.suspend(() => {
        attempts++;
        return Effect.fail(new EncryptionFailed({ message: "user error" }));
      }),
    );
    await expect(Effect.runPromise(program)).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("gives up after max retries", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.suspend(() => {
        attempts++;
        return Effect.fail(new EncryptionFailed({ message: "timeout forever" }));
      }),
    );
    await expect(Effect.runPromise(program)).rejects.toThrow();
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });
});
