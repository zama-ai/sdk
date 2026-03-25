import { describe, it, expect } from "../../test-fixtures";
import { pLimit } from "../concurrency";

describe("pLimit", () => {
  it("resolves all results in order", async () => {
    const fns = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)];

    const results = await pLimit(fns);

    expect(results).toEqual([1, 2, 3]);
  });

  it("returns empty array for empty input", async () => {
    const results = await pLimit([]);
    expect(results).toEqual([]);
  });

  it("runs all in parallel with Infinity (default)", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const createFn = () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return maxConcurrent;
    };

    await pLimit([createFn(), createFn(), createFn(), createFn()]);

    expect(maxConcurrent).toBe(4);
  });

  it("limits concurrency to maxConcurrency", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const createFn = (val: number) => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return val;
    };

    const results = await pLimit(
      [createFn(1), createFn(2), createFn(3), createFn(4), createFn(5)],
      2,
    );

    expect(maxConcurrent).toBeLessThanOrEqual(2);
    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles maxConcurrency of 1 (serial execution)", async () => {
    const order: number[] = [];

    const createFn = (val: number) => async () => {
      order.push(val);
      await new Promise((r) => setTimeout(r, 5));
      return val;
    };

    const results = await pLimit([createFn(1), createFn(2), createFn(3)], 1);

    expect(results).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it("falls back to Promise.all when maxConcurrency >= fns.length", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;

    const createFn = () => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, 10));
      concurrent--;
      return true;
    };

    await pLimit([createFn(), createFn(), createFn()], 10);

    expect(maxConcurrent).toBe(3); // All run in parallel
  });

  it("propagates errors from thunks", async () => {
    const fns = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error("boom")),
      () => Promise.resolve(3),
    ];

    await expect(pLimit(fns, 1)).rejects.toThrow("boom");
  });
});
