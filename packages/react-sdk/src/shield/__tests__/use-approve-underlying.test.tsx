import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useApproveUnderlying } from "../use-approve-underlying";

describe("useApproveUnderlying", () => {
  test("default", ({ renderWithProviders, wrapperAddress }) => {
    const { result } = renderWithProviders(() => useApproveUnderlying(wrapperAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates allowance after approve", async ({
    renderWithProviders,
    provider,
    otherTokenAddress,
    underlyingAddress,
    wrapperAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(0n);

    const { result, queryClient } = renderWithProviders(() => useApproveUnderlying(wrapperAddress));

    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(wrapperAddress);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(otherTokenAddress);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(otherAllowanceKey, 777n);

    await act(() => result.current.mutateAsync({ amount: 1000n }));

    expect(queryClient.getQueryData(allowanceKey)).toBe(500n);
    expect(queryClient).toHaveCacheInvalidated(allowanceKey);
    expect(queryClient).toHaveCacheUntouched(otherAllowanceKey, 777n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    underlyingAddress,
    wrapperAddress,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(0n);

    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(wrapperAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useApproveUnderlying(wrapperAddress, {
        onSuccess,
      }),
    );

    queryClient.setQueryData(allowanceKey, 500n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 1000n }),
      onSuccess,
      (client: QueryClient) => {
        expect(client.getQueryData(allowanceKey)).toBe(500n);
        expect(client).toHaveCacheInvalidated(allowanceKey);
      },
    );
  });
});
