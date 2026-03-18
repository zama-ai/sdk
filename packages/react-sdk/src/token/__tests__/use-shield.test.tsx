import { act, waitFor } from "@testing-library/react";
import { ApprovalFailedError, TransactionRevertedError } from "@zama-fhe/sdk";
import { shieldMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheInvalidated, expectCacheUntouched } from "../../test-helpers";
import { useShield } from "../use-shield";
import {
  HANDLE,
  OTHER_TOKEN,
  TOKEN,
  UNDERLYING,
  USER,
  WAGMI_BALANCE_KEY,
  WRAPPER,
  expectDefaultMutationState,
  expectInvalidatedQueries,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useShield", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates allowance and removes balance after shield", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
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

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expectInvalidatedQueries(queryClient, [handleKey, balanceKey]);
    expect(queryClient.getQueryData(allowanceKey)).toBe(500n);
    expectCacheInvalidated(queryClient, allowanceKey);
    expectCacheInvalidated(queryClient, WAGMI_BALANCE_KEY);
    expectCacheUntouched(queryClient, otherHandleKey, HANDLE);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }, { onSuccess }),
    );

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(WAGMI_BALANCE_KEY, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 500n }),
      onSuccess,
      (client) => {
        expectInvalidatedQueries(client, [handleKey, balanceKey]);
        expect(client.getQueryData(allowanceKey)).toBe(500n);
        expectCacheInvalidated(client, allowanceKey);
        expectCacheInvalidated(client, WAGMI_BALANCE_KEY);
      },
    );
  });

  test("behavior: forwards raw onMutate context to onSuccess without optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const expectedContext = { requestId: "shield-success-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }, { onMutate, onSuccess }),
    );

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    const onSuccessContext = onSuccess.mock.calls[0]?.[2];
    expect(onSuccessContext).toBe(expectedContext);
  });

  test("behavior: forwards raw onMutate context to onError without optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));

    const expectedContext = { requestId: "shield-error-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }, { onMutate, onError }),
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ amount: 500n })).rejects.toThrow();
    });

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    const onErrorContext = onError.mock.calls[0]?.[2];
    expect(onErrorContext).toBe(expectedContext);
  });

  test("behavior: forwards raw onMutate context to onSettled without optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const expectedContext = { requestId: "shield-settled-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }, { onMutate, onSettled }),
    );

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onSuccess with optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const expectedContext = { requestId: "shield-success-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield(
        { tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true },
        {
          onMutate,
          onSuccess,
        },
      ),
    );

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    const onSuccessContext = onSuccess.mock.calls[0]?.[2];
    expect(onSuccessContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onError with optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));

    const expectedContext = { requestId: "shield-error-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield(
        { tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true },
        {
          onMutate,
          onError,
        },
      ),
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ amount: 500n })).rejects.toThrow();
    });

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    const onErrorContext = onError.mock.calls[0]?.[2];
    expect(onErrorContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onSettled with optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(0n);

    const expectedContext = { requestId: "shield-settled-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield(
        { tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true },
        {
          onMutate,
          onSettled,
        },
      ),
    );

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });
});

describe("useShield optimistic updates", () => {
  test("behavior: optimistic add on mutate", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(5000n);

    let resolveWrap: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveWrap = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 3000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3500n);
    });
    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(["zama.confidentialBalance"]),
      }),
    );
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(setQueryDataSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeLessThan(
      setQueryDataSpy.mock.invocationCallOrder[0],
    );

    await act(async () => {
      resolveWrap!("0xtxhash");
    });
  });

  test("behavior: rolls back optimistic on error", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 3000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(3000n);
    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(["zama.confidentialBalance"]),
      }),
    );
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(setQueryDataSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeLessThan(
      setQueryDataSpy.mock.invocationCallOrder[0],
    );
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3500n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3000n);
  });

  test("behavior: no optimistic update without flag", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(5000n);

    let resolveWrap: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveWrap = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 3000n);

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    expect(queryClient.getQueryData(balanceKey)).toBe(3000n);

    await act(async () => {
      resolveWrap!("0xtxhash");
    });
  });

  test("optimistic: no error when balance cache is empty", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValueOnce(UNDERLYING).mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);

    await act(() => result.current.mutateAsync({ amount: 500n }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
  });
});

describe("useShield error propagation", () => {
  test("shield surfaces ApprovalFailedError", async ({ token }) => {
    const error = new ApprovalFailedError("ERC-20 approval failed");
    vi.mocked(token.shield).mockRejectedValueOnce(error);

    const opts = shieldMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(ApprovalFailedError);
  });

  test("shield surfaces TransactionRevertedError", async ({ token }) => {
    const error = new TransactionRevertedError("Shield (wrap) transaction failed");
    vi.mocked(token.shield).mockRejectedValueOnce(error);

    const opts = shieldMutationOptions(token);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(TransactionRevertedError);
  });
});
