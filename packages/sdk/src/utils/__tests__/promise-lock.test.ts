import { describe, it, expect, vi } from "../../test-fixtures";
import { PromiseLock } from "../promise-lock";

describe("PromiseLock", () => {
  it("runs the function and returns the result", async () => {
    const lock = new PromiseLock<number>();
    const result = await lock.run(async () => 42);
    expect(result).toBe(42);
  });

  it("deduplicates concurrent calls — fn is invoked once", async () => {
    const lock = new PromiseLock<string>();
    let resolve!: (v: string) => void;
    const fn = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );

    const p1 = lock.run(fn);
    const p2 = lock.run(fn);
    const p3 = lock.run(fn);

    resolve("done");

    const results = await Promise.all([p1, p2, p3]);
    expect(results).toEqual(["done", "done", "done"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("releases the lock after the promise resolves", async () => {
    const lock = new PromiseLock<number>();
    const fn = vi.fn(async () => 1);

    await lock.run(fn);
    await lock.run(fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("releases the lock after the promise rejects", async () => {
    const lock = new PromiseLock<number>();
    const fail = vi.fn(async () => {
      throw new Error("boom");
    });
    const succeed = vi.fn(async () => 99);

    await expect(lock.run(fail)).rejects.toThrow("boom");

    const result = await lock.run(succeed);
    expect(result).toBe(99);
    expect(succeed).toHaveBeenCalledTimes(1);
  });

  it("propagates the same rejection to all concurrent callers", async () => {
    const lock = new PromiseLock<void>();
    let reject!: (e: Error) => void;
    const fn = vi.fn(
      () =>
        new Promise<void>((_, r) => {
          reject = r;
        }),
    );

    const p1 = lock.run(fn);
    const p2 = lock.run(fn);

    reject(new Error("fail"));

    await expect(p1).rejects.toThrow("fail");
    await expect(p2).rejects.toThrow("fail");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("clear() drops the in-flight promise", async () => {
    const lock = new PromiseLock<string>();
    const fn = vi.fn(
      () =>
        new Promise<string>(() => {
          /* never resolves */
        }),
    );

    // Start a call that will hang
    lock.run(fn);
    lock.clear();

    // After clear, a new call should invoke fn again
    lock.run(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("Symbol.dispose calls clear", async () => {
    const lock = new PromiseLock<string>();
    const fn = vi.fn(
      () =>
        new Promise<string>(() => {
          /* never resolves */
        }),
    );

    lock.run(fn);
    lock[Symbol.dispose]();

    // After dispose, a new call should invoke fn again
    lock.run(fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
