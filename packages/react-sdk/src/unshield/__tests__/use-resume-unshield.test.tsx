import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, test, vi } from "../../test-fixtures";
import { useResumeUnshield } from "../use-resume-unshield";

describe("useResumeUnshield", () => {
  test("default", ({ renderWithProviders, tokenAddress, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useResumeUnshield(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates balance, allowance, and wagmi after resume unshield", async ({
    renderWithProviders,
    provider,
    burnAmountHandle,
    otherTokenAddress,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    createUnwrapRequestedLog,
    expectCacheInvalidated,
    expectCacheUntouched,
    expectInvalidatedQueries,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(burnAmountHandle)],
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

    expectInvalidatedQueries(queryClient, [balanceKey, allowanceKey]);
    expectCacheInvalidated(queryClient, wagmiBalanceKey);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    burnAmountHandle,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    createUnwrapRequestedLog,
    expectCacheInvalidated,
    expectInvalidatedQueries,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(burnAmountHandle)],
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
        expectInvalidatedQueries(client, [balanceKey, allowanceKey]);
        expectCacheInvalidated(client, wagmiBalanceKey);
      },
    );
  });
});
