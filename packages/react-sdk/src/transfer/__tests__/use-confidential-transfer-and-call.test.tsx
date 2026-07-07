import { act, renderHook, waitFor } from "@testing-library/react";
import { type QueryClient, useMutation } from "@tanstack/react-query";
import type { TypedValue } from "@fhevm/sdk/types";
import type { DecryptValuesParameters } from "@fhevm/sdk/actions/decrypt";
import type { Address, Hex } from "@zama-fhe/sdk";
import { EncryptionFailedError, SigningRejectedError } from "@zama-fhe/sdk";
import { confidentialTransferAndCallMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { useConfidentialBalance } from "../../balance/use-confidential-balance";
import { useConfidentialTransferAndCall } from "../use-confidential-transfer-and-call";

// Opaque payload forwarded to the receiver hook — the hook never inspects it.
const DATA = "0xdeadbeef" as Hex;

describe("useConfidentialTransferAndCall", () => {
  test("default", ({ renderWithProviders, tokenAddress }) => {
    const { result } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress }),
    );
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expect(state).toEqualDefaultMutationState();
  });

  test("cache: invalidates balance after transfer", async ({
    renderWithProviders,
    signer,
    otherTokenAddress,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(otherTokenAddress, userAddress);

    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(otherBalanceKey, 777n);

    await act(() =>
      result.current.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );

    expect(queryClient).toHaveInvalidatedQueries([balanceKey]);
    expect(queryClient).toHaveCacheUntouched(otherBalanceKey, 777n);
  });

  test("behavior: forwards onSuccess callback", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    userAddress,
    mutateAndExpectOnSuccess,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress }, { onSuccess }),
    );

    queryClient.setQueryData(balanceKey, 1000n);

    await mutateAndExpectOnSuccess(
      () =>
        result.current.mutateAsync({
          to: recipientAddress,
          amount: 500n,
          data: DATA,
          skipBalanceCheck: true,
        }),
      onSuccess,
      (client: QueryClient) => expect(client).toHaveInvalidatedQueries([balanceKey]),
    );
  });

  test("behavior: forwards raw onMutate context to onSuccess without optimistic flag", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-and-call-success-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress }, { onMutate, onSuccess }),
    );

    await act(() =>
      result.current.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    const onSuccessContext = onSuccess.mock.calls[0]?.[2];
    expect(onSuccessContext).toBe(expectedContext);
  });

  test("behavior: forwards raw onMutate context to onError without optimistic flag", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const expectedContext = { requestId: "transfer-and-call-error-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress }, { onMutate, onError }),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          to: recipientAddress,
          amount: 500n,
          data: DATA,
          skipBalanceCheck: true,
        }),
      ).rejects.toThrow();
    });

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    const onErrorContext = onError.mock.calls[0]?.[2];
    expect(onErrorContext).toBe(expectedContext);
  });

  test("behavior: forwards raw onMutate context to onSettled without optimistic flag", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-and-call-settled-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress }, { onMutate, onSettled }),
    );

    await act(() =>
      result.current.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onSuccess with optimistic flag", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-and-call-success-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransferAndCall(
        { address: tokenAddress, optimistic: true },
        { onMutate, onSuccess },
      ),
    );

    await act(() =>
      result.current.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    const onSuccessContext = onSuccess.mock.calls[0]?.[2];
    expect(onSuccessContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onError with optimistic flag", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const expectedContext = { requestId: "transfer-and-call-error-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransferAndCall(
        { address: tokenAddress, optimistic: true },
        { onMutate, onError },
      ),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          to: recipientAddress,
          amount: 500n,
          data: DATA,
          skipBalanceCheck: true,
        }),
      ).rejects.toThrow();
    });

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
    const onErrorContext = onError.mock.calls[0]?.[2];
    expect(onErrorContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onSettled with optimistic flag", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-and-call-settled-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransferAndCall(
        { address: tokenAddress, optimistic: true },
        { onMutate, onSettled },
      ),
    );

    await act(() =>
      result.current.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });

  test("composition: transfer invalidates confidential balance", async ({
    createWrapper,
    signer,
    relayer,
    provider,
    handle,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    const handleB = `0x${"44".repeat(32)}`;

    // Both Phase 1 (handleQuery) and Phase 2 (token.balanceOf) read the handle
    // via provider.readContract; track the "current" handle and flip it on the
    // transaction write so the post-transfer refetch sees handleB.
    let currentHandle: string = handle;
    vi.mocked(provider.readContract).mockImplementation(async () => currentHandle);
    vi.mocked(relayer.decryptValues).mockImplementation(
      async ({ encryptedValues }: DecryptValuesParameters) => [
        { type: "uint64", value: encryptedValues[0] === handle ? 1000n : 500n } as TypedValue,
      ],
    );
    vi.mocked(signer.writeContract).mockImplementation(async () => {
      currentHandle = handleB;
      return "0xtxhash";
    });

    const { Wrapper } = createWrapper({ signer, relayer });
    const { result } = renderHook(
      () => ({
        balance: useConfidentialBalance({ address: tokenAddress, account: userAddress }),
        transfer: useConfidentialTransferAndCall({ address: tokenAddress }),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(
      () => {
        expect(result.current.balance.data).toBe(1000n);
      },
      { timeout: 5_000 },
    );

    await act(() =>
      result.current.transfer.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );

    await waitFor(
      () => {
        expect(result.current.balance.data).toBe(500n);
      },
      { timeout: 5_000 },
    );
  });
});

describe("useConfidentialTransferAndCall optimistic updates", () => {
  test("behavior: optimistic subtract on mutate", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    let resolveTransfer: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 5000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({
        to: recipientAddress,
        amount: 1200n,
        data: DATA,
        skipBalanceCheck: true,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(balanceKey)).toBe(3800n);
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
      resolveTransfer!("0xtxhash");
    });
  });

  test("optimistic: no error when balance cache is empty", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);

    await act(() =>
      result.current.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
  });

  test("optimistic: cancelQueries uses confidential balance key prefix", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 1000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");

    await act(() =>
      result.current.mutateAsync({
        to: recipientAddress,
        amount: 500n,
        data: DATA,
        skipBalanceCheck: true,
      }),
    );

    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(["zama.confidentialBalance"]) }),
    );
  });

  test("behavior: no optimistic update without flag", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    let resolveTransfer: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 5000n);

    await act(async () => {
      result.current.mutate({
        to: recipientAddress,
        amount: 1200n,
        data: DATA,
        skipBalanceCheck: true,
      });
    });

    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);

    await act(async () => {
      resolveTransfer!("0xtxhash");
    });
  });

  test("behavior: rolls back optimistic on error", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 5000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({
        to: recipientAddress,
        amount: 1200n,
        data: DATA,
        skipBalanceCheck: true,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);
    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: expect.arrayContaining(["zama.confidentialBalance"]) }),
    );
    expect(cancelSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(setQueryDataSpy.mock.invocationCallOrder[0]).toBeDefined();
    expect(cancelSpy.mock.invocationCallOrder[0]!).toBeLessThan(
      setQueryDataSpy.mock.invocationCallOrder[0]!,
    );
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3800n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 5000n);
  });

  test("behavior: onError still fires when rollback throws (try/finally resilience)", async ({
    renderWithProviders,
    signer,
    recipientAddress,
    tokenAddress,
    userAddress,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const onError = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransferAndCall({ address: tokenAddress, optimistic: true }, { onError }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(tokenAddress, userAddress);
    queryClient.setQueryData(balanceKey, 5000n);

    // Sabotage setQueryData after the optimistic write so rollback throws
    const originalSetQueryData = queryClient.setQueryData.bind(queryClient);
    let callCount = 0;
    vi.spyOn(queryClient, "setQueryData").mockImplementation(
      (key: readonly unknown[], value: unknown) => {
        callCount++;
        // First call is the optimistic subtract, let it through.
        // Second call (rollback) should throw.
        if (callCount <= 1) {
          return originalSetQueryData(key, value);
        }
        throw new Error("rollback boom");
      },
    );

    // Suppress the expected unhandled rejection from the rollback error
    // propagating through the mutation executor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const suppress = (reason: any) => {
      if (reason instanceof Error && reason.message === "rollback boom") {
        return;
      }
      throw reason;
    };
    process.on("unhandledRejection", suppress);

    try {
      await act(async () => {
        result.current.mutate({
          to: recipientAddress,
          amount: 500n,
          data: DATA,
          skipBalanceCheck: true,
        });
      });

      await waitFor(() => expect(result.current.isError).toBe(true));

      // The caller's onError must have been called despite the rollback failure
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    } finally {
      process.removeListener("unhandledRejection", suppress);
    }
  });
});

describe("useConfidentialTransferAndCall error propagation", () => {
  test("propagates SigningRejectedError to mutation state", async ({
    createWrapper,
    mockWrappedToken,
  }) => {
    const error = new SigningRejectedError("user rejected");
    vi.mocked(mockWrappedToken.confidentialTransferAndCall).mockRejectedValueOnce(error);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(
      () => useMutation(confidentialTransferAndCallMutationOptions(mockWrappedToken)),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ to: "0xto" as Address, amount: 100n, data: DATA }),
      ).rejects.toBe(error);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error instanceof SigningRejectedError).toBe(true);
  });

  test("confidentialTransferAndCall surfaces EncryptionFailedError", async ({
    mockWrappedToken: token,
  }) => {
    const error = new EncryptionFailedError("Failed to encrypt transfer amount");
    vi.mocked(token.confidentialTransferAndCall).mockRejectedValue(error);

    const opts = confidentialTransferAndCallMutationOptions(token);

    await expect(
      opts.mutationFn({ to: "0xto" as Address, amount: 100n, data: DATA }),
    ).rejects.toThrow(EncryptionFailedError);
    await expect(
      opts.mutationFn({ to: "0xto" as Address, amount: 100n, data: DATA }),
    ).rejects.toThrow("Failed to encrypt transfer amount");
  });
});
