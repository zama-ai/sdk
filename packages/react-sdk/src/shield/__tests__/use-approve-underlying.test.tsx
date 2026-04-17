import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheUntouched } from "../../test-helpers";
import { useApproveUnderlying } from "../use-approve-underlying";
import {
  OTHER_TOKEN,
  TOKEN,
  UNDERLYING,
  WRAPPER,
  expectDefaultMutationState,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useApproveUnderlying", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useApproveUnderlying({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates allowance after approve", async ({
    renderWithProviders,
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const { result, queryClient } = renderWithProviders(() =>
      useApproveUnderlying({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
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
    signer,
    provider,
  }) => {
    vi.mocked(provider.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useApproveUnderlying(
        { tokenAddress: TOKEN, wrapperAddress: WRAPPER },
        {
          onSuccess,
        },
      ),
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
