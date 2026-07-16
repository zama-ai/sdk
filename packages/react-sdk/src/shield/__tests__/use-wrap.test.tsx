import type { QueryClient } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useWrap } from "../use-wrap";

describe("useWrap", () => {
  test("default", ({ renderWithProviders, wrapperAddress }) => {
    const { result } = renderWithProviders(() => useWrap(wrapperAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;
    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates balance after wrap", async ({
    renderWithProviders,
    provider,
    underlyingAddress,
    wrapperAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress) // underlying()
      .mockResolvedValueOnce(1000n) // balanceOf
      .mockResolvedValueOnce(1000n); // allowance

    const { result, queryClient } = renderWithProviders(() => useWrap(wrapperAddress));

    const balanceKey = zamaQueryKeys.confidentialBalance.token(wrapperAddress);
    queryClient.setQueryData(balanceKey, 5n);

    await act(() => result.current.mutateAsync({ amount: 100n }));

    expect(queryClient).toHaveCacheInvalidated(balanceKey);
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
      .mockResolvedValueOnce(1000n)
      .mockResolvedValueOnce(1000n);

    const onSuccess = vi.fn();
    const { result } = renderWithProviders(() => useWrap(wrapperAddress, { onSuccess }));

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 100n }),
      onSuccess,
      (_client: QueryClient) => {},
    );
  });
});
