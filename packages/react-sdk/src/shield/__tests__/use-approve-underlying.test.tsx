import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useApproveUnderlying } from "../use-approve-underlying";
describe("useApproveUnderlying", () => {
  test("default", ({ renderWithProviders, WRAPPER, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useApproveUnderlying(WRAPPER));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates allowance after approve", async ({
    renderWithProviders,
    provider,
    OTHER_TOKEN,
    UNDERLYING,
    WRAPPER,
    expectCacheInvalidated,
    expectCacheUntouched,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const { result, queryClient } = renderWithProviders(() => useApproveUnderlying(WRAPPER));

    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(WRAPPER);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(OTHER_TOKEN);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(otherAllowanceKey, 777n);

    await act(() => result.current.mutateAsync({ amount: 1000n }));

    expect(queryClient.getQueryData(allowanceKey)).toBe(500n);
    expectCacheInvalidated(queryClient, allowanceKey);
    expectCacheUntouched(queryClient, otherAllowanceKey, 777n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    UNDERLYING,
    WRAPPER,
    expectCacheInvalidated,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(WRAPPER);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useApproveUnderlying(WRAPPER, {
        onSuccess,
      }),
    );

    queryClient.setQueryData(allowanceKey, 500n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 1000n }),
      onSuccess,
      (client) => {
        expect(client.getQueryData(allowanceKey)).toBe(500n);
        expectCacheInvalidated(client, allowanceKey);
      },
    );
  });
});
