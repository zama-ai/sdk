import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useBatchState } from "../use-batch-state";
import { useCurrentBatchId } from "../use-current-batch-id";
import { useTimeUntilDispatchable } from "../use-time-until-dispatchable";

const BATCHER_ADDRESS = "0x7777777777777777777777777777777777777777" as Address;

describe("useCurrentBatchId", () => {
  test("reads the currently open batch id", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(58n);
    const { result } = renderWithProviders(() => useCurrentBatchId({ address: BATCHER_ADDRESS }));

    await waitFor(() => expect(result.current.data).toBe(58n));
  });
});

describe("useBatchState", () => {
  test("stays disabled until batchId is provided", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useBatchState({ address: BATCHER_ADDRESS, batchId: undefined }),
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("reads the batch state once batchId is provided", async ({
    renderWithProviders,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(0);
    const { result } = renderWithProviders(() =>
      useBatchState({ address: BATCHER_ADDRESS, batchId: 58n }),
    );

    await waitFor(() => expect(result.current.data).toBe(0));
  });
});

describe("useTimeUntilDispatchable", () => {
  test("reads seconds remaining and forwards refetchInterval", async ({
    renderWithProviders,
    provider,
  }) => {
    // timeUntilDispatchable composes three provider calls: batchCreatedAt,
    // minBatchAge (both via readContract), and getBlockTimestamp.
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(1_000n) // batchCreatedAt
      .mockResolvedValueOnce(3_480n); // minBatchAge
    vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(2_000n); // now

    const { result } = renderWithProviders(() =>
      useTimeUntilDispatchable({ address: BATCHER_ADDRESS, batchId: 58n, refetchInterval: 5_000 }),
    );

    // eligible at 1_000 + 3_480 = 4_480; now is 2_000 → 2_480 remaining
    await waitFor(() => expect(result.current.data).toBe(2_480n));
  });
});
