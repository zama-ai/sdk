import { act, renderHook, waitFor } from "@testing-library/react";
import { useMutation } from "@tanstack/react-query";
import type { Address } from "@zama-fhe/sdk";
import { EncryptionFailedError, SigningRejectedError } from "@zama-fhe/sdk";
import { confidentialTransferMutationOptions, zamaQueryKeys } from "@zama-fhe/sdk/query";
import { describe, expect, test, vi } from "../../test-fixtures";
import { expectCacheUntouched } from "../../test-helpers";
import { useConfidentialBalance } from "../use-confidential-balance";
import { useConfidentialTransfer } from "../use-confidential-transfer";
import {
  HANDLE,
  OTHER_TOKEN,
  RECIPIENT,
  TOKEN,
  USER,
  expectDefaultMutationState,
  expectInvalidatedQueries,
  mutateAndExpectOnSuccess,
} from "../../__tests__/mutation-test-helpers";

describe("useConfidentialTransfer", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useConfidentialTransfer({ tokenAddress: TOKEN }));
    const { mutate: _mutate, mutateAsync: _mutateAsync, reset: _reset, ...state } = result.current;

    expectDefaultMutationState(state);
  });

  test("cache: invalidates handle and resets balance after transfer", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN }),
    );

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const activityKey = zamaQueryKeys.activityFeed.token(TOKEN);
    const otherHandleKey = zamaQueryKeys.confidentialHandle.token(OTHER_TOKEN);
    const otherBalanceKey = zamaQueryKeys.confidentialBalance.owner(OTHER_TOKEN, USER, HANDLE);
    const otherActivityKey = zamaQueryKeys.activityFeed.token(OTHER_TOKEN);
    const seededActivity = [{ id: "evt-1" }];
    const seededOtherActivity = [{ id: "evt-2" }];

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(activityKey, seededActivity);
    queryClient.setQueryData(otherHandleKey, HANDLE);
    queryClient.setQueryData(otherBalanceKey, 777n);
    queryClient.setQueryData(otherActivityKey, seededOtherActivity);

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));

    expectInvalidatedQueries(queryClient, [handleKey, balanceKey, activityKey]);
    expectCacheUntouched(queryClient, otherHandleKey, HANDLE);
    expectCacheUntouched(queryClient, otherBalanceKey, 777n);
    expectCacheUntouched(queryClient, otherActivityKey, seededOtherActivity);
  });

  test("behavior: forwards onSuccess callback", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const handleKey = zamaQueryKeys.confidentialHandle.token(TOKEN);
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    const activityKey = zamaQueryKeys.activityFeed.token(TOKEN);
    const onSuccess = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN }, { onSuccess }),
    );

    queryClient.setQueryData(handleKey, HANDLE);
    queryClient.setQueryData(balanceKey, 1000n);
    queryClient.setQueryData(activityKey, [{ id: "evt-1" }]);

    await mutateAndExpectOnSuccess(
      () => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }),
      onSuccess,
      (client) => expectInvalidatedQueries(client, [handleKey, balanceKey, activityKey]),
    );
  });

  test("behavior: forwards raw onMutate context to onSuccess without optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-success-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN }, { onMutate, onSuccess }),
    );

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    const onSuccessContext = onSuccess.mock.calls[0]?.[2];
    expect(onSuccessContext).toBe(expectedContext);
  });

  test("behavior: forwards raw onMutate context to onError without optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const expectedContext = { requestId: "transfer-error-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN }, { onMutate, onError }),
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true })).rejects.toThrow();
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
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-settled-raw" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN }, { onMutate, onSettled }),
    );

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onSuccess with optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-success-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSuccess = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransfer(
        { tokenAddress: TOKEN, optimistic: true },
        {
          onMutate,
          onSuccess,
        },
      ),
    );

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledOnce();
    const onSuccessContext = onSuccess.mock.calls[0]?.[2];
    expect(onSuccessContext).toBe(expectedContext);
  });

  test("behavior: unwraps caller context for onError with optimistic flag", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const expectedContext = { requestId: "transfer-error-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onError = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransfer(
        { tokenAddress: TOKEN, optimistic: true },
        {
          onMutate,
          onError,
        },
      ),
    );

    await act(async () => {
      await expect(result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true })).rejects.toThrow();
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
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const expectedContext = { requestId: "transfer-settled-optimistic" } as const;
    const onMutate = vi.fn().mockReturnValue(expectedContext);
    const onSettled = vi.fn();

    const { result } = renderWithProviders(() =>
      useConfidentialTransfer(
        { tokenAddress: TOKEN, optimistic: true },
        {
          onMutate,
          onSettled,
        },
      ),
    );

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));

    expect(onMutate).toHaveBeenCalledOnce();
    expect(onSettled).toHaveBeenCalledOnce();
    const onSettledContext = onSettled.mock.calls[0]?.[3];
    expect(onSettledContext).toBe(expectedContext);
  });

  test("composition: transfer invalidates confidential balance", async ({
    createWrapper,
    signer,
    relayer,
  }) => {
    const handleB = `0x${"44".repeat(32)}`;

    vi.mocked(signer.readContract).mockResolvedValueOnce(HANDLE).mockResolvedValueOnce(handleB);
    vi.mocked(relayer.userDecrypt)
      .mockResolvedValueOnce({ [HANDLE]: 1000n })
      .mockResolvedValueOnce({ [handleB]: 500n });
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { Wrapper } = createWrapper({ signer, relayer });
    const { result } = renderHook(
      () => ({
        balance: useConfidentialBalance({ tokenAddress: TOKEN }),
        transfer: useConfidentialTransfer({ tokenAddress: TOKEN }),
      }),
      { wrapper: Wrapper },
    );

    await waitFor(
      () => {
        expect(result.current.balance.data).toBe(1000n);
      },
      { timeout: 5_000 },
    );

    await act(() => result.current.transfer.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));

    await waitFor(
      () => {
        expect(result.current.balance.data).toBe(500n);
      },
      { timeout: 5_000 },
    );
  });
});

describe("useConfidentialTransfer optimistic updates", () => {
  test("behavior: optimistic subtract on mutate", async ({ renderWithProviders, signer }) => {
    let resolveTransfer: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 5000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({
        to: RECIPIENT,
        amount: 1200n,
        skipBalanceCheck: true,
      });
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(balanceKey)).toBe(3800n);
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
      resolveTransfer!("0xtxhash");
    });
  });

  test("optimistic: no error when balance cache is empty", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(balanceKey)).toBeUndefined();
  });

  test("optimistic: cancelQueries uses confidential balance key prefix", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 1000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");

    await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true }));

    expect(cancelSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: expect.arrayContaining(["zama.confidentialBalance"]),
      }),
    );
  });

  test("behavior: no optimistic update without flag", async ({ renderWithProviders, signer }) => {
    let resolveTransfer: (value: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (value: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 5000n);

    await act(async () => {
      result.current.mutate({
        to: RECIPIENT,
        amount: 1200n,
        skipBalanceCheck: true,
      });
    });

    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);

    await act(async () => {
      resolveTransfer!("0xtxhash");
    });
  });

  test("behavior: rolls back optimistic on error", async ({ renderWithProviders, signer }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 5000n);
    const cancelSpy = vi.spyOn(queryClient, "cancelQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({
        to: RECIPIENT,
        amount: 1200n,
        skipBalanceCheck: true,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);
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
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3800n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 5000n);
  });

  test("behavior: onError still fires when rollback throws (try/finally resilience)", async ({
    renderWithProviders,
    signer,
  }) => {
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const onError = vi.fn();

    const { result, queryClient } = renderWithProviders(() =>
      useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }, { onError }),
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, HANDLE);
    queryClient.setQueryData(balanceKey, 5000n);

    // Sabotage setQueryData after the optimistic write so rollback throws
    const originalSetQueryData = queryClient.setQueryData.bind(queryClient);
    let callCount = 0;
    vi.spyOn(queryClient, "setQueryData").mockImplementation((key, value) => {
      callCount++;
      // First call is the optimistic subtract, let it through.
      // Second call (rollback) should throw.
      if (callCount <= 1) {
        return originalSetQueryData(key, value);
      }
      throw new Error("rollback boom");
    });

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
        result.current.mutate({ to: RECIPIENT, amount: 500n, skipBalanceCheck: true });
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

describe("useConfidentialTransfer error propagation", () => {
  test("propagates SigningRejectedError to mutation state", async ({ createWrapper, token }) => {
    const error = new SigningRejectedError("user rejected");
    vi.mocked(token.confidentialTransfer).mockRejectedValueOnce(error);

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useMutation(confidentialTransferMutationOptions(token)), {
      wrapper: Wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({ to: "0xto" as Address, amount: 100n }),
      ).rejects.toBe(error);
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error instanceof SigningRejectedError).toBe(true);
  });

  test("confidentialTransfer surfaces EncryptionFailedError", async ({ token }) => {
    const error = new EncryptionFailedError("Failed to encrypt transfer amount");
    vi.mocked(token.confidentialTransfer).mockRejectedValue(error);

    const opts = confidentialTransferMutationOptions(token);

    await expect(opts.mutationFn({ to: "0xto" as Address, amount: 100n })).rejects.toThrow(
      EncryptionFailedError,
    );
    await expect(opts.mutationFn({ to: "0xto" as Address, amount: 100n })).rejects.toThrow(
      "Failed to encrypt transfer amount",
    );
  });
});
