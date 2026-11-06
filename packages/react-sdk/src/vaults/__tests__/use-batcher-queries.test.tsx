import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { BatchState } from "@zama-fhe/sdk/vaults";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useBatchState } from "../use-batch-state";
import { useBatcherTokens } from "../use-batcher-tokens";
import { useBatchStatus } from "../use-batch-status";
import { usePaused } from "../use-paused";
import { useCurrentBatchId } from "../use-current-batch-id";
import { useTimeUntilCallbackDeadline } from "../use-time-until-callback-deadline";
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
  test("reads seconds remaining", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(BatchState.Pending) // batchState
      .mockResolvedValueOnce(1_000n) // batchCreatedAt
      .mockResolvedValueOnce(3_480n); // batchMinBatchAge(batchId)
    vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(2_000n); // now

    const { result } = renderWithProviders(() =>
      useTimeUntilDispatchable(
        { address: BATCHER_ADDRESS, batchId: 58n },
        { refetchInterval: 5_000 },
      ),
    );

    // eligible at 1_000 + 3_480 = 4_480; now is 2_000 → 2_480 remaining
    await waitFor(() => expect(result.current.data).toBe(2_480n));
  });
});

describe("useTimeUntilCallbackDeadline", () => {
  test("reads seconds remaining before a dispatched batch is canceled", async ({
    renderWithProviders,
    provider,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(BatchState.Dispatched) // batchState
      .mockResolvedValueOnce(1_000n) // batchDispatchedAt
      .mockResolvedValueOnce(600n); // batchCallbackDeadline
    vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(1_200n); // now

    const { result } = renderWithProviders(() =>
      useTimeUntilCallbackDeadline({ address: BATCHER_ADDRESS, batchId: 58n }),
    );

    await waitFor(() => expect(result.current.data).toBe(400n));
  });
});

describe("useTimeUntilDispatchable, once the batch has left Pending", () => {
  test("reports null rather than a 0 countdown", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(BatchState.Finalized) // batchState
      .mockResolvedValueOnce(1_000n) // batchCreatedAt
      .mockResolvedValueOnce(3_480n); // batchMinBatchAge(batchId)
    vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(99_000n);

    const { result } = renderWithProviders(() =>
      useTimeUntilDispatchable({ address: BATCHER_ADDRESS, batchId: 58n }),
    );

    await waitFor(() => expect(result.current.data).toBeNull());
  });
});

describe("useBatchStatus", () => {
  test("stays disabled until batchId is provided", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useBatchStatus({ address: BATCHER_ADDRESS, batchId: undefined }),
    );
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("reads the state with its timestamps", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(BatchState.Pending) // batchState
      .mockResolvedValueOnce(1_000n) // batchCreatedAt
      .mockResolvedValueOnce(0n) // batchDispatchedAt
      .mockResolvedValueOnce(600n) // batchMinBatchAge
      .mockResolvedValueOnce(600n); // batchCallbackDeadline
    vi.mocked(provider.getBlockTimestamp).mockResolvedValueOnce(1_200n);

    const { result } = renderWithProviders(() =>
      useBatchStatus({ address: BATCHER_ADDRESS, batchId: 58n }),
    );

    await waitFor(() =>
      expect(result.current.data).toEqual({
        state: BatchState.Pending,
        createdAt: 1_000n,
        dispatchableAt: 1_600n,
        secondsUntilDispatchable: 400n,
      }),
    );
  });
});

describe("usePaused", () => {
  test("reads whether the batcher is paused", async ({ renderWithProviders, provider }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(true);
    const { result } = renderWithProviders(() => usePaused({ address: BATCHER_ADDRESS }));

    await waitFor(() => expect(result.current.data).toBe(true));
  });
});

describe("useBatcherTokens", () => {
  test("reads the input and output tokens", async ({ renderWithProviders, provider }) => {
    const FROM = "0x2222222222222222222222222222222222222222";
    const TO = "0x3333333333333333333333333333333333333333";
    vi.mocked(provider.readContract).mockResolvedValueOnce(FROM).mockResolvedValueOnce(TO);
    const { result } = renderWithProviders(() =>
      useBatcherTokens({ address: BATCHER_ADDRESS, chainId: 31337 }),
    );

    await waitFor(() => expect(result.current.data).toEqual({ fromToken: FROM, toToken: TO }));
    expect(provider.readContract).toHaveBeenCalledWith(expect.objectContaining({ chainId: 31337 }));
  });
});
