import { act, renderHook, waitFor } from "@testing-library/react";
import { type QueryClient, useMutation } from "@tanstack/react-query";
import { DecryptionFailedError } from "@zama-fhe/sdk";
import { finalizeUnwrapMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useFinalizeUnwrap } from "../use-finalize-unwrap";

describe("useFinalizeUnwrap", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useFinalizeUnwrap(tokenAddress));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates balance, allowance, and wagmi after finalize", async ({
    renderWithProviders,
    unwrapRequestId,
    otherTokenAddress,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
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

    await act(() => result.current.mutateAsync({ unwrapRequestId }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey, allowanceKey]);
    expect(queryClient).toHaveCacheInvalidated(wagmiBalanceKey);
    expect(queryClient).toHaveCacheUntouched(otherBalanceKey, 777n);
    expect(queryClient).toHaveCacheUntouched(otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    unwrapRequestId,
    tokenAddress,
    userAddress,
    wagmiBalanceKey,
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
      () => result.current.mutateAsync({ unwrapRequestId }),
      onSuccess,
      (client: QueryClient) => {
        expect(client).toHaveInvalidatedQueries([balanceKey, allowanceKey]);
        expect(client).toHaveCacheInvalidated(wagmiBalanceKey);
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
