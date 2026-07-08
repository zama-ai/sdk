import type { QueryClient } from "@tanstack/react-query";
import { act, waitFor } from "@testing-library/react";
import { TransactionRevertedError } from "@zama-fhe/sdk";
import { shieldMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useShield } from "../use-shield";

describe("useShield", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() => useShield({ address: tokenAddress }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates allowance and removes balance after shield", async ({
    renderWithProviders,
    provider,
    otherTokenAddress,
    tokenAddress,
    underlyingAddress,
    userAddress,
    wagmiBalanceKey,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    const { result, queryClient } = renderWithProviders(() => useShield({ address: tokenAddress }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);
    const otherAllowanceKey = zamaQueryKeys.underlyingAllowance.token(otherTokenAddress);

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherAllowanceKey, 333n);

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
    expect(queryClient.getQueryData(allowanceKey)).toBe(500n);
    expect(queryClient).toHaveCacheInvalidated(allowanceKey);
    expect(queryClient).toHaveCacheInvalidated(wagmiBalanceKey);
    expect(queryClient).toHaveCacheUntouched(otherBalanceKey, 777n);
    expect(queryClient).toHaveCacheUntouched(otherAllowanceKey, 333n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    provider,
    tokenAddress,
    underlyingAddress,
    userAddress,
    wagmiBalanceKey,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const allowanceKey = zamaQueryKeys.underlyingAllowance.token(tokenAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ address: tokenAddress }, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 3000n);
    queryClient.setQueryData(allowanceKey, 500n);
    queryClient.setQueryData(wagmiBalanceKey, 2000n);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ amount: 500n }),
      onSuccess,
      (client: QueryClient) => {
        expect(client).toHaveInvalidatedQueries([balanceKey]);
        expect(client.getQueryData(allowanceKey)).toBe(500n);
        expect(client).toHaveCacheInvalidated(allowanceKey);
        expect(client).toHaveCacheInvalidated(wagmiBalanceKey);
      },
    );
  });

  test("behavior: forwards raw onMutate context to onSuccess without optimistic flag", async ({
    renderWithProviders,
    provider,
    tokenAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    const expectedContext = { requestId: "shield-success-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ address: tokenAddress }, { onMutate, onSuccess }),
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
    provider,
    tokenAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract!).mockRejectedValue(new Error("shield failed"));

    const expectedContext = { requestId: "shield-error-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ address: tokenAddress }, { onMutate, onError }),
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
    provider,
    tokenAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    const expectedContext = { requestId: "shield-settled-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ address: tokenAddress }, { onMutate, onSettled }),
    );

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onSuccess with optimistic flag", async ({
    renderWithProviders,
    provider,
    tokenAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    const expectedContext = { requestId: "shield-success-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ address: tokenAddress, optimistic: true }, { onMutate, onSuccess }),
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
    provider,
    tokenAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract!).mockRejectedValue(new Error("shield failed"));

    const expectedContext = { requestId: "shield-error-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ address: tokenAddress, optimistic: true }, { onMutate, onError }),
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
    provider,
    tokenAddress,
    underlyingAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    const expectedContext = { requestId: "shield-settled-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useShield({ address: tokenAddress, optimistic: true }, { onMutate, onSettled }),
    );

    await act(() => result.current.mutateAsync({ amount: 500n }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });
});

describe("useShield optimistic updates", () => {
  test("behavior: optimistic add on mutate", async ({
    renderWithProviders,
    signer,
    provider,
    tokenAddress,
    underlyingAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    let resolveWrap: (value: string) => void;
    vi.mocked(signer.writeContract!).mockReturnValue(
      new Promise((resolve) => {
        resolveWrap = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ address: tokenAddress, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
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
      expect.objectContaining({ queryKey: expect.arrayContaining(["zama.confidentialBalance"]) }),
    );
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(setQueryDataSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(cancelSpy.mock.invocationCallOrder[0]!).toBeLessThan(
      setQueryDataSpy.mock.invocationCallOrder[0]!,
    );

    await act(async () => {
      resolveWrap!("0xtxhash");
    });
  });

  test("behavior: rolls back optimistic on error", async ({
    renderWithProviders,
    signer,
    provider,
    tokenAddress,
    underlyingAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract!).mockRejectedValue(new Error("shield failed"));

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ address: tokenAddress, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 3000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(3000n);
    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(["zama.confidentialBalance"]) }),
    );
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(setQueryDataSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(cancelSpy.mock.invocationCallOrder[0]!).toBeLessThan(
      setQueryDataSpy.mock.invocationCallOrder[0]!,
    );
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3500n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3000n);
  });

  test("behavior: no optimistic update without flag", async ({
    renderWithProviders,
    signer,
    provider,
    tokenAddress,
    underlyingAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);

    let resolveWrap: (value: string) => void;
    vi.mocked(signer.writeContract!).mockReturnValue(
      new Promise((resolve) => {
        resolveWrap = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() => useShield({ address: tokenAddress }));

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
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
    provider,
    tokenAddress,
    underlyingAddress,
    userAddress,
  }) => {
    vi.mocked(provider.readContract)
      .mockResolvedValueOnce(underlyingAddress)
      .mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract!).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useShield({ address: tokenAddress, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);

    await act(() => result.current.mutateAsync({ amount: 500n }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
  });
});

describe("useShield error propagation", () => {
  test("shield surfaces TransactionRevertedError", async ({ mockWrappedToken }) => {
    const error = new TransactionRevertedError("Shield (wrap) transaction failed");
    vi.mocked(mockWrappedToken.shield).mockRejectedValueOnce(error);

    const opts = shieldMutationOptions(mockWrappedToken);

    await expect(opts.mutationFn({ amount: 100n })).rejects.toThrow(TransactionRevertedError);
  });
});
