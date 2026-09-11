import { act } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { vaultQueryKeys } from "@zama-fhe/sdk/vaults";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useClaim } from "../use-claim";
import { useDispatchBatch } from "../use-dispatch-batch";
import { useJoin } from "../use-join";
import { useQuit } from "../use-quit";
import { useRecover } from "../use-recover";

const BATCHER_ADDRESS = "0x7777777777777777777777777777777777777777" as Address;
const FROM_TOKEN = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const TO_TOKEN = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;

describe("useJoin", () => {
  test("joins the batch and invalidates the input token's balance cache", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(FROM_TOKEN); // fromToken()
    const { result, queryClient } = renderWithProviders(() =>
      useJoin({ address: BATCHER_ADDRESS }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(FROM_TOKEN, userAddress);
    queryClient.setQueryData(balanceKey, 1_000n);

    await act(() => result.current.mutateAsync({ amount: 1_000n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
  });
});

describe("useClaim", () => {
  test("claims and invalidates the output token's balance cache", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(TO_TOKEN); // toToken()
    const { result, queryClient } = renderWithProviders(() =>
      useClaim({ address: BATCHER_ADDRESS }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TO_TOKEN, userAddress);
    queryClient.setQueryData(balanceKey, 0n);

    await act(() => result.current.mutateAsync({ batchId: 7n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
  });
});

describe("useQuit", () => {
  test("quits and invalidates the input token's balance cache", async ({
    renderWithProviders,
    provider,
    userAddress,
    signer,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(FROM_TOKEN);
    const { result, queryClient } = renderWithProviders(() =>
      useQuit({ address: BATCHER_ADDRESS }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(FROM_TOKEN, userAddress);
    queryClient.setQueryData(balanceKey, 1_000n);

    await act(() => result.current.mutateAsync({ batchId: 3n }));

    expect(signer.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({ functionName: "quit", args: [3n] }),
    );
    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
  });
});

describe("useRecover", () => {
  test("recovers and invalidates the input token's balance cache", async ({
    renderWithProviders,
    provider,
    userAddress,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(FROM_TOKEN);
    const { result, queryClient } = renderWithProviders(() =>
      useRecover({ address: BATCHER_ADDRESS }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(FROM_TOKEN, userAddress);
    queryClient.setQueryData(balanceKey, 1_000n);

    await act(() => result.current.mutateAsync({ batchId: 9n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
  });
});

describe("useDispatchBatch", () => {
  test("dispatches and invalidates the batcher's currentBatchId cache", async ({
    renderWithProviders,
  }) => {
    const { result, queryClient } = renderWithProviders(() =>
      useDispatchBatch({ address: BATCHER_ADDRESS }),
    );

    const batchIdKey = vaultQueryKeys.currentBatchId.batcher(BATCHER_ADDRESS);
    queryClient.setQueryData(batchIdKey, 58n);

    await act(() => result.current.mutateAsync());

    expect(queryClient).toHaveInvalidatedQueries([batchIdKey]);
  });
});
