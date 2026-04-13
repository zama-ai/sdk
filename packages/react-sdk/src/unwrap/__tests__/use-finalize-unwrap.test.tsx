import { act, renderHook, waitFor } from "@testing-library/react";
import { useMutation } from "@tanstack/react-query";
import { DecryptionFailedError } from "@zama-fhe/sdk";
import { finalizeUnwrapMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheUntouched } from "../../test-helpers";
import { useFinalizeUnwrap } from "../use-finalize-unwrap";
import {
  BURN_AMOUNT_HANDLE,
  HANDLE,
  MOCK_TOKEN_ADDRESS,
  OTHER_TOKEN,
  TOKEN,
  USER,
  WAGMI_BALANCE_KEY,
  expectDefaultMutationState,
  expectInvalidatedQueries,
  mockPublicDecrypt,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useFinalizeUnwrap", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useFinalizeUnwrap({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates balance, allowance, and wagmi after finalize", async ({
    renderWithProviders,
    relayer,
  }) => {
    mockPublicDecrypt(relayer);

    const { result, queryClient } = renderWithProviders(() =>
      useFinalizeUnwrap({ tokenAddress: TOKEN }),
    );

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const otherHandleKey = zamaQueryKeys.confidentialHandle.token(OTHER_TOKEN);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(OTHER_TOKEN, USER, HANDLE);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(OTHER_TOKEN);

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);
    queryClient.setQueryData(otherHandleKey, HANDLE);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ unwrapRequestId: BURN_AMOUNT_HANDLE }));

    expectInvalidatedQueries(queryClient, [handleKey, balanceKey, allowanceKey]);
    expectCacheInvalidated(queryClient, WAGMI_BALANCE_KEY);
    expectCacheUntouched(queryClient, otherHandleKey, HANDLE);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, relayer }) => {
    mockPublicDecrypt(relayer);

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useFinalizeUnwrap({ tokenAddress: TOKEN }, { onSuccess }),
    );

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ unwrapRequestId: BURN_AMOUNT_HANDLE }),
      onSuccess,
      (client) => {
        expectInvalidatedQueries(client, [handleKey, balanceKey, allowanceKey]);
        expectCacheInvalidated(client, WAGMI_BALANCE_KEY);
      },
    );
  });
});

describe("useFinalizeUnwrap error propagation", () => {
  test("propagates DecryptionFailedError from userDecrypt failure", async ({
    createWrapper,
    token,
    relayer,
  }) => {
    const error = new DecryptionFailedError("decryption timeout");
    vi.mocked(relayer.userDecrypt).mockRejectedValueOnce(error);
    vi.mocked(token.finalizeUnwrap).mockImplementationOnce(async () => {
      await relayer.userDecrypt({} as never);
      return { txHash: "0xtx", receipt: { logs: [] } };
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMutation(finalizeUnwrapMutationOptions(token)), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ unwrapRequestId: MOCK_TOKEN_ADDRESS }),
      ).rejects.toBe(error);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(vi.mocked(relayer.userDecrypt)).toHaveBeenCalledOnce();
    expect(result.current.error).toBeInstanceOf(DecryptionFailedError);
  });
});
