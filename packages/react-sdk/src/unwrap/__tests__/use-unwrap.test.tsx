import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useUnwrap } from "../use-unwrap";

describe("useUnwrap", () => {
  test("default", ({ renderWithProviders, tokenAddress, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useUnwrap(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates allowance and removes handle/balance after unwrap", async ({
    renderWithProviders,
    otherTokenAddress,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    expectCacheInvalidated,
    expectCacheUntouched,
    expectInvalidatedQueries,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useUnwrap(tokenAddress));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(otherTokenAddress);

    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ amount: 300n }));

    expectInvalidatedQueries(queryClient, [balanceKey]);
    expect(queryClient.getQueryData(allowanceKey)).toBe(500n);
    expectCacheInvalidated(queryClient, allowanceKey);
    expectCacheInvalidated(queryClient, wagmiBalanceKey);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    expectCacheInvalidated,
    expectInvalidatedQueries,
    mutateAndExpectOnSuccess,
  }) => {
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useUnwrap(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 300n }),
      onSuccess,
      (client: QueryClient) => {
        expectInvalidatedQueries(client, [balanceKey]);
        expect(client.getQueryData(allowanceKey)).toBe(500n);
        expectCacheInvalidated(client, allowanceKey);
        expectCacheInvalidated(client, wagmiBalanceKey);
      },
    );
  });
});
