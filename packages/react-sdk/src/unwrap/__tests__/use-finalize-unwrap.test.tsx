import { act, renderHook, waitFor } from "@testing-library/react";
import { type QueryClient, useMutation } from "@tanstack/react-query";
import { DecryptionFailedError } from "@zama-fhe/sdk";
import { finalizeUnwrapMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useFinalizeUnwrap } from "../use-finalize-unwrap";

describe("useFinalizeUnwrap", () => {
  test("default", ({ renderWithProviders, tokenAddress, expectDefaultMutationState }) => {
    const { result } = renderWithProviders(() => useFinalizeUnwrap(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates balance, allowance, and wagmi after finalize", async ({
    renderWithProviders,
    burnAmountHandle,
    otherTokenAddress,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
    expectCacheInvalidated,
    expectCacheUntouched,
    expectInvalidatedQueries,
  }) => {
    const { result, queryClient } = renderWithProviders(() => useFinalizeUnwrap(tokenAddress));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(otherTokenAddress);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ unwrapRequestId: burnAmountHandle }));

    expectInvalidatedQueries(queryClient, [balanceKey, allowanceKey]);
    expectCacheInvalidated(queryClient, wagmiBalanceKey);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    burnAmountHandle,
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
      useFinalizeUnwrap(tokenAddress, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ unwrapRequestId: burnAmountHandle }),
      onSuccess,
      (client: QueryClient) => {
        expectInvalidatedQueries(client, [balanceKey, allowanceKey]);
        expectCacheInvalidated(client, wagmiBalanceKey);
      },
    );
  });
});

describe("useFinalizeUnwrap error propagation", () => {
  test("propagates DecryptionFailedError from userDecrypt failure", async ({
    createWrapper,
    mockWrappedToken: token,
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
      await expect(result.current.mutateAsync({ unwrapRequestId: token.address })).rejects.toBe(
        error,
      );
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(vi.mocked(relayer.userDecrypt)).toHaveBeenCalledOnce();
    expect(result.current.error).toBeInstanceOf(DecryptionFailedError);
  });
});
