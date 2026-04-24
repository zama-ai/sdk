import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheUntouched } from "../../test-helpers";
import { useUnshield } from "../use-unshield";
import {
  BURN_AMOUNT_HANDLE,
  OTHER_TOKEN,
  TOKEN,
  USER,
  WAGMI_BALANCE_KEY,
  createUnwrapRequestedLog,
  expectDefaultMutationState,
  expectInvalidatedQueries,
  mockPublicDecrypt,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useUnshield", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnshield({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates balance, allowance, and wagmi after unshield", async ({
    renderWithProviders,
    relayer,
    provider,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(BURN_AMOUNT_HANDLE)],
    });
    mockPublicDecrypt(relayer);

    const { result, queryClient } = renderWithProviders(() => useUnshield({ tokenAddress: TOKEN }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(OTHER_TOKEN, USER);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(OTHER_TOKEN);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ amount: 300n, skipBalanceCheck: true }));

    expectInvalidatedQueries(queryClient, [balanceKey, allowanceKey]);
    expectCacheInvalidated(queryClient, WAGMI_BALANCE_KEY);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    relayer,
    provider,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(BURN_AMOUNT_HANDLE)],
    });
    mockPublicDecrypt(relayer);

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useUnshield({ tokenAddress: TOKEN }, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 300n, skipBalanceCheck: true }),
      onSuccess,
      (client) => {
        expectInvalidatedQueries(client, [balanceKey, allowanceKey]);
        expectCacheInvalidated(client, WAGMI_BALANCE_KEY);
      },
    );
  });
});
