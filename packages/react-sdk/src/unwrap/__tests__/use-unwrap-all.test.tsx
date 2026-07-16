import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useUnwrapAll } from "../use-unwrap-all";

describe("useUnwrapAll", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useUnwrapAll(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates allowance and removes handle/balance after unwrap all", async ({
    renderWithProviders,
    provider,
    handle,
    unwrapRequestId,
    createUnwrapRequestedLog,
    otherTokenAddress,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(unwrapRequestId)],
    });

    const { result, queryClient } = renderWithProviders(() => useUnwrapAll(tokenAddress));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(otherTokenAddress);

    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync());

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
    expect(queryClient.getQueryData(allowanceKey)).toBe(500n);
    expect(queryClient).toHaveCacheInvalidated(allowanceKey);
    expect(queryClient).toHaveCacheInvalidated(wagmiBalanceKey);
    expect(queryClient).toHaveCacheUntouched(otherBalanceKey, 777n);
    expect(queryClient).toHaveCacheUntouched(otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    handle,
    unwrapRequestId,
    createUnwrapRequestedLog,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValue(handle);
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(unwrapRequestId)],
    });
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useUnwrapAll(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync(),
      onSuccess,
      (client: QueryClient) => {
        expect(client).toHaveInvalidatedQueries([balanceKey]);
        expect(client.getQueryData(allowanceKey)).toBe(500n);
        expect(client).toHaveCacheInvalidated(allowanceKey);
        expect(client).toHaveCacheInvalidated(wagmiBalanceKey);
      },
      { variables: "undefined" },
    );
  });
});
