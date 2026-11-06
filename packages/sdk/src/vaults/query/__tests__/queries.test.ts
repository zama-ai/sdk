import type { Address } from "viem";
import { describe, expect, test, vi } from "../../../test-fixtures";
import type { VaultBatcher } from "../../vault-batcher";
import { batchStateQueryOptions } from "../batch-state";
import { batchStatusQueryOptions } from "../batch-status";
import { currentBatchIdQueryOptions } from "../current-batch-id";
import { timeUntilCallbackDeadlineQueryOptions } from "../time-until-callback-deadline";
import { timeUntilDispatchableQueryOptions } from "../time-until-dispatchable";

const BATCHER_ADDRESS = "0x1111111111111111111111111111111111111111" as Address;

function createMockBatcher(): VaultBatcher {
  return {
    address: BATCHER_ADDRESS,
    currentBatchId: vi.fn().mockResolvedValue(58n),
    batchState: vi.fn().mockResolvedValue(0),
    batchStatus: vi.fn().mockResolvedValue({ state: 2 }),
    timeUntilDispatchable: vi.fn().mockResolvedValue(120n),
    timeUntilCallbackDeadline: vi.fn().mockResolvedValue(30n),
  } as unknown as VaultBatcher;
}

describe("currentBatchIdQueryOptions", () => {
  test("is always enabled and delegates to batcher.currentBatchId", async () => {
    const batcher = createMockBatcher();
    const options = currentBatchIdQueryOptions(batcher);

    expect(options.enabled).toBe(true);
    expect(options.queryKey).toEqual([
      "zama.vault.currentBatchId",
      { batcherAddress: BATCHER_ADDRESS },
    ]);
    await expect(options.queryFn(undefined as never)).resolves.toBe(58n);
  });
});

describe("batchStateQueryOptions", () => {
  test("stays disabled until batchId is provided", () => {
    const batcher = createMockBatcher();
    expect(batchStateQueryOptions(batcher).enabled).toBe(false);
    expect(batchStateQueryOptions(batcher, { batchId: 58n }).enabled).toBe(true);
  });

  test("delegates to batcher.batchState with the batch id from the query key", async () => {
    const batcher = createMockBatcher();
    const options = batchStateQueryOptions(batcher, { batchId: 58n });

    const result = await options.queryFn({ queryKey: options.queryKey } as never);
    expect(result).toBe(0);
    expect(batcher.batchState).toHaveBeenCalledWith(58n);
  });
});

describe("timeUntilDispatchableQueryOptions", () => {
  test("stays disabled until batchId is provided", () => {
    const batcher = createMockBatcher();
    expect(timeUntilDispatchableQueryOptions(batcher).enabled).toBe(false);
    expect(timeUntilDispatchableQueryOptions(batcher, { batchId: 58n }).enabled).toBe(true);
  });

  test("delegates to batcher.timeUntilDispatchable", async () => {
    const batcher = createMockBatcher();
    const options = timeUntilDispatchableQueryOptions(batcher, { batchId: 58n });

    const result = await options.queryFn({ queryKey: options.queryKey } as never);
    expect(result).toBe(120n);
    expect(batcher.timeUntilDispatchable).toHaveBeenCalledWith(58n);
  });
});

describe("timeUntilCallbackDeadlineQueryOptions", () => {
  test("stays disabled until batchId is provided", () => {
    const batcher = createMockBatcher();
    expect(timeUntilCallbackDeadlineQueryOptions(batcher).enabled).toBe(false);
    expect(timeUntilCallbackDeadlineQueryOptions(batcher, { batchId: 58n }).enabled).toBe(true);
  });

  test("delegates to batcher.timeUntilCallbackDeadline", async () => {
    const batcher = createMockBatcher();
    const options = timeUntilCallbackDeadlineQueryOptions(batcher, { batchId: 58n });

    expect(options.queryKey).toEqual([
      "zama.vault.timeUntilCallbackDeadline",
      { batcherAddress: BATCHER_ADDRESS, batchId: 58n },
    ]);
    const result = await options.queryFn({ queryKey: options.queryKey } as never);
    expect(result).toBe(30n);
    expect(batcher.timeUntilCallbackDeadline).toHaveBeenCalledWith(58n);
  });
});

describe("batchStatusQueryOptions", () => {
  test("stays disabled until batchId is provided", () => {
    const batcher = createMockBatcher();
    expect(batchStatusQueryOptions(batcher).enabled).toBe(false);
    expect(batchStatusQueryOptions(batcher, { batchId: 58n }).enabled).toBe(true);
  });

  test("delegates to batcher.batchStatus", async () => {
    const batcher = createMockBatcher();
    const options = batchStatusQueryOptions(batcher, { batchId: 58n });

    expect(options.queryKey).toEqual([
      "zama.vault.batchStatus",
      { batcherAddress: BATCHER_ADDRESS, batchId: 58n },
    ]);
    const result = await options.queryFn({ queryKey: options.queryKey } as never);
    expect(result).toEqual({ state: 2 });
    expect(batcher.batchStatus).toHaveBeenCalledWith(58n);
  });
});
