import { describe, test, expect } from "../../test-fixtures";
import { AsyncLocalMapStorage } from "../async-local-storage";

describe("AsyncLocalMapStorage", () => {
  test("returns null outside of a run context", async () => {
    const storage = new AsyncLocalMapStorage();
    expect(await storage.get("key")).toBeNull();
  });

  test("set is a no-op outside of a run context", async () => {
    const storage = new AsyncLocalMapStorage();
    await storage.set("key", "value");
    expect(await storage.get("key")).toBeNull();
  });

  test("delete is a no-op outside of a run context", async () => {
    const storage = new AsyncLocalMapStorage();
    await expect(storage.delete("key")).resolves.not.toThrow();
  });

  test("stores and retrieves values within a run context", async () => {
    const storage = new AsyncLocalMapStorage();
    await storage.run(async () => {
      await storage.set("key", "value");
      expect(await storage.get("key")).toBe("value");
    });
  });

  test("overwrites existing values", async () => {
    const storage = new AsyncLocalMapStorage();
    await storage.run(async () => {
      await storage.set("key", "old");
      await storage.set("key", "new");
      expect(await storage.get("key")).toBe("new");
    });
  });

  test("deletes values within a run context", async () => {
    const storage = new AsyncLocalMapStorage();
    await storage.run(async () => {
      await storage.set("key", "value");
      await storage.delete("key");
      expect(await storage.get("key")).toBeNull();
    });
  });

  test("isolates data between run contexts", async () => {
    const storage = new AsyncLocalMapStorage();

    await Promise.all([
      storage.run(async () => {
        await storage.set("key", "context-1");
        // Yield to allow other context to run
        await new Promise((r) => setTimeout(r, 0));
        expect(await storage.get("key")).toBe("context-1");
      }),
      storage.run(async () => {
        await storage.set("key", "context-2");
        await new Promise((r) => setTimeout(r, 0));
        expect(await storage.get("key")).toBe("context-2");
      }),
    ]);
  });

  test("data does not persist after run completes", async () => {
    const storage = new AsyncLocalMapStorage();
    await storage.run(async () => {
      await storage.set("key", "value");
    });
    // Outside the run context, data is gone
    expect(await storage.get("key")).toBeNull();
  });

  test("handles synchronous run callback", () => {
    const storage = new AsyncLocalMapStorage();
    const result = storage.run(() => {
      return "sync-result";
    });
    expect(result).toBe("sync-result");
  });

  test("handles complex objects", async () => {
    const storage = new AsyncLocalMapStorage();
    await storage.run(async () => {
      const obj = { nested: { array: [1, 2, 3] } };
      await storage.set("complex", obj);
      expect(await storage.get("complex")).toEqual(obj);
    });
  });

  test("returns null for missing keys within a run context", async () => {
    const storage = new AsyncLocalMapStorage();
    await storage.run(async () => {
      expect(await storage.get("missing")).toBeNull();
    });
  });
});
