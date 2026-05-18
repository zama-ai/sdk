import { act } from "@testing-library/react";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, test, vi } from "../../test-fixtures";
import { useResumeUnshield } from "../use-resume-unshield";
describe("useResumeUnshield", () => {
  test("default", ({ renderWithProviders, TOKEN, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useResumeUnshield(TOKEN));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates balance, allowance, and wagmi after resume unshield", async ({
    renderWithProviders,
    relayer,
    provider,
    BURN_AMOUNT_HANDLE,
    OTHER_TOKEN,
    TOKEN,
    USER,
    WAGMI_BALANCE_KEY,
    createUnwrapRequestedLog,
    expectCacheInvalidated,
    expectCacheUntouched,
    expectInvalidatedQueries,
    mockPublicDecrypt,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(BURN_AMOUNT_HANDLE)],
    });
    mockPublicDecrypt(relayer);

    const { result, queryClient } = renderWithProviders(() => useResumeUnshield(TOKEN));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(OTHER_TOKEN, USER);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(OTHER_TOKEN);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ unwrapTxHash: "0xtxhash" }));

    expectInvalidatedQueries(queryClient, [balanceKey, allowanceKey]);
    expectCacheInvalidated(queryClient, WAGMI_BALANCE_KEY);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    relayer,
    provider,
    BURN_AMOUNT_HANDLE,
    TOKEN,
    USER,
    WAGMI_BALANCE_KEY,
    createUnwrapRequestedLog,
    expectCacheInvalidated,
    expectInvalidatedQueries,
    mockPublicDecrypt,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [createUnwrapRequestedLog(BURN_AMOUNT_HANDLE)],
    });
    mockPublicDecrypt(relayer);

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useResumeUnshield(TOKEN, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ unwrapTxHash: "0xtxhash" }),
      onSuccess,
      (client) => {
        expectInvalidatedQueries(client, [balanceKey, allowanceKey]);
        expectCacheInvalidated(client, WAGMI_BALANCE_KEY);
      },
    );
  });
});
