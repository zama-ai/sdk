import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { UnshieldAlreadyFinalizedError } from "@zama-fhe/sdk";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { zeroAddress } from "viem";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useResumeUnshield } from "../use-resume-unshield";

describe("useResumeUnshield", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useResumeUnshield(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates balance, allowance, and wagmi after resume unshield", async ({
    renderWithProviders,
    provider,
    unwrapRequestId,
    otherTokenAddress,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    createUnwrapRequestedLog,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(unwrapRequestId)],
    });

    const { result, queryClient } = renderWithProviders(() => useResumeUnshield(tokenAddress));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(otherTokenAddress);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ unwrapTxHash: "0xtxhash" }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey, allowanceKey]);
    expect(queryClient).toHaveCacheInvalidated(wagmiBalanceKey);
    expect(queryClient).toHaveCacheUntouched(otherBalanceKey, 777n);
    expect(queryClient).toHaveCacheUntouched(otherAllowanceKey, 333n);
  });

  test("cache: invalidates queries when the unshield was already finalized", async ({
    renderWithProviders,
    provider,
    unwrapRequestId,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    createUnwrapRequestedLog,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(unwrapRequestId)],
    });
    // The resume pre-check reads unwrapRequester: zero address = request consumed.
    vi.mocked(provider.readContract).mockResolvedValue(zeroAddress);

    const onError = vi.fn();
    const { result, queryClient } = renderWithProviders(() =>
      useResumeUnshield(tokenAddress, { onError }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);

    await act(async () => {
      await expect(result.current.mutateAsync({ unwrapTxHash: "0xtxhash" })).rejects.toBeInstanceOf(
        UnshieldAlreadyFinalizedError,
      );
    });

    expect(onError).toHaveBeenCalledWith(
      expect.any(UnshieldAlreadyFinalizedError),
      expect.anything(),
      undefined,
      expect.anything(),
    );
    expect(queryClient).toHaveInvalidatedQueries([balanceKey, allowanceKey]);
    expect(queryClient).toHaveCacheInvalidated(wagmiBalanceKey);
  });

  test("cache: leaves queries untouched on unrelated errors", async ({
    renderWithProviders,
    provider,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockRejectedValue(new Error("RPC unavailable"));

    const { result, queryClient } = renderWithProviders(() => useResumeUnshield(tokenAddress));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 3000n);

    await act(async () => {
      await expect(result.current.mutateAsync({ unwrapTxHash: "0xtxhash" })).rejects.toThrow();
    });

    expect(queryClient).toHaveCacheUntouched(balanceKey, 3000n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    unwrapRequestId,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    createUnwrapRequestedLog,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(unwrapRequestId)],
    });

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useResumeUnshield(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ unwrapTxHash: "0xtxhash" }),
      onSuccess,
      (client: QueryClient) => {
        expect(client).toHaveInvalidatedQueries([balanceKey, allowanceKey]);
        expect(client).toHaveCacheInvalidated(wagmiBalanceKey);
      },
    );
  });
});
