import { describe, it, expect, vi } from "../../test-fixtures";
import { Batcher } from "../batcher";

describe("Batcher", () => {
  it("calls fn once when items fit in a single batch", async () => {
    const batcher = new Batcher(10);
    const fn = vi.fn().mockResolvedValue("result");

    const result = await batcher.execute([1, 2, 3], fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith([1, 2, 3]);
    expect(result).toBe("result");
  });

  it("calls fn once when items are exactly the batch size", async () => {
    const batcher = new Batcher(3);
    const fn = vi.fn().mockResolvedValue("result");

    await batcher.execute([1, 2, 3], fn);

    expect(fn).toHaveBeenCalledOnce();
    expect(fn).toHaveBeenCalledWith([1, 2, 3]);
  });

  it("chunks into multiple batches with accumulated items", async () => {
    const batcher = new Batcher(3);
    const fn = vi.fn().mockResolvedValue("result");

    await batcher.execute([1, 2, 3, 4, 5, 6, 7], fn);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls[0]![0]).toEqual([1, 2, 3]);
    expect(fn.mock.calls[1]![0]).toEqual([1, 2, 3, 4, 5, 6]);
    expect(fn.mock.calls[2]![0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("calls batches sequentially", async () => {
    const batcher = new Batcher(2);
    const callOrder: number[] = [];
    const fn = vi.fn().mockImplementation(async (items: number[]) => {
      callOrder.push(items.length);
    });

    await batcher.execute([1, 2, 3, 4, 5], fn);

    expect(callOrder).toEqual([2, 4, 5]);
  });

  it("throws when given an empty array", async () => {
    const batcher = new Batcher(10);
    const fn = vi.fn();

    await expect(batcher.execute([], fn)).rejects.toThrow("At least one item is required");
    expect(fn).not.toHaveBeenCalled();
  });

  it("throws when batchSize is less than 1", () => {
    expect(() => new Batcher(0)).toThrow("batchSize must be at least 1");
    expect(() => new Batcher(-1)).toThrow("batchSize must be at least 1");
  });

  it("propagates errors from the callback", async () => {
    const batcher = new Batcher(10);
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(batcher.execute([1], fn)).rejects.toThrow("boom");
  });

  it("stops on first batch failure", async () => {
    const batcher = new Batcher(2);
    const fn = vi
      .fn()
      .mockResolvedValueOnce("ok")
      .mockRejectedValueOnce(new Error("batch 2 failed"));

    await expect(batcher.execute([1, 2, 3, 4, 5], fn)).rejects.toThrow("batch 2 failed");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("returns the result of the final batch", async () => {
    const batcher = new Batcher(2);
    const fn = vi
      .fn()
      .mockResolvedValueOnce("first")
      .mockResolvedValueOnce("second")
      .mockResolvedValueOnce("final");

    const result = await batcher.execute([1, 2, 3, 4, 5], fn);

    expect(result).toBe("final");
  });

  it("does not mutate the accumulated array between calls", async () => {
    const batcher = new Batcher(2);
    const captured: number[][] = [];
    const fn = vi.fn().mockImplementation(async (items: number[]) => {
      captured.push(items);
    });

    await batcher.execute([1, 2, 3], fn);

    // Each captured array should be independent
    expect(captured[0]).toEqual([1, 2]);
    expect(captured[1]).toEqual([1, 2, 3]);
    captured[0]!.push(99);
    expect(captured[1]).toEqual([1, 2, 3]); // not affected
  });
});
