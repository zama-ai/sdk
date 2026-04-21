import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheUntouched } from "../../test-helpers";
import { useUnwrap } from "../use-unwrap";
import {
  OTHER_TOKEN,
  TOKEN,
  USER,
  WAGMI_BALANCE_KEY,
  expectDefaultMutationState,
  expectInvalidatedQueries,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useUnwrap", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnwrap({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates allowance and removes handle/balance after unwrap", async ({
    renderWithProviders,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useUnwrap({ tokenAddress: TOKEN }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(OTHER_TOKEN, USER);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(OTHER_TOKEN);

    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ amount: 300n }));

    expectInvalidatedQueries(queryClient, [balanceKey]);
    expect(queryClient.getQueryData(allowanceKey)).toBe(500n);
    expectCacheInvalidated(queryClient, allowanceKey);
    expectCacheInvalidated(queryClient, WAGMI_BALANCE_KEY);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders }) => {
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useUnwrap({ tokenAddress: TOKEN }, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 300n }),
      onSuccess,
      (client) => {
        expectInvalidatedQueries(client, [balanceKey]);
        expect(client.getQueryData(allowanceKey)).toBe(500n);
        expectCacheInvalidated(client, allowanceKey);
        expectCacheInvalidated(client, WAGMI_BALANCE_KEY);
      },
    );
  });
});
