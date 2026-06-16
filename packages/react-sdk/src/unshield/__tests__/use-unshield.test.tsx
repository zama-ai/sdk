import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useUnshield } from "../use-unshield";

describe("useUnshield", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useUnshield(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates balance, allowance, and wagmi after unshield", async ({
    renderWithProviders,
    provider,
    burnAmount,
    otherTokenAddress,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    createUnwrapRequestedLog,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(burnAmount)],
    });

    const { result, queryClient } = renderWithProviders(() => useUnshield(tokenAddress));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(otherTokenAddress);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ amount: 300n, skipBalanceCheck: true }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey, allowanceKey]);
    expect(queryClient).toHaveCacheInvalidated(wagmiBalanceKey);
    expect(queryClient).toHaveCacheUntouched(otherBalanceKey, 777n);
    expect(queryClient).toHaveCacheUntouched(otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    burnAmount,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    createUnwrapRequestedLog,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(burnAmount)],
    });

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useUnshield(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 300n, skipBalanceCheck: true }),
      onSuccess,
      (client: QueryClient) => {
        expect(client).toHaveInvalidatedQueries([balanceKey, allowanceKey]);
        expect(client).toHaveCacheInvalidated(wagmiBalanceKey);
      },
    );
  });
});
