import { describe, expect, it, test, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useConfidentialTransferFrom } from "../token/use-confidential-transfer-from";
import { useFinalizeUnwrap } from "../token/use-finalize-unwrap";
import { useUnshield } from "../token/use-unshield";
import { useUnshieldAll } from "../token/use-unshield-all";
import { useUnwrap } from "../token/use-unwrap";
import { useUnwrapAll } from "../token/use-unwrap-all";
import { useShieldETH } from "../token/use-shield-eth";
import { useActivityFeed } from "../token/use-activity-feed";
import { useConfidentialBalance } from "../token/use-confidential-balance";
import { useConfidentialBalances } from "../token/use-confidential-balances";
import { useUserDecryptedValue } from "../relayer/use-user-decrypted-value";
import { decryptionKeys } from "../relayer/decryption-cache";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import {
  createWrapper,
  renderWithProviders,
  createMockSigner,
  createMockRelayer,
} from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;

/**
 * Creates a mock relayer whose publicDecrypt returns a value
 * that BigInt() can parse (the default mock returns "0x" which
 * is not a valid BigInt literal).
 */
function createRelayerWithValidDecrypt() {
  const relayer = createMockRelayer();
  vi.mocked(relayer.publicDecrypt).mockResolvedValue({
    clearValues: {},
    abiEncodedClearValues: "0x0",
    decryptionProof: "0xproof",
  } as never);
  return relayer;
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe("useConfidentialTransferFrom", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useConfidentialTransferFrom({ tokenAddress: TOKEN }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.confidentialTransferFrom on mutateAsync", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(
      () => useConfidentialTransferFrom({ tokenAddress: TOKEN }),
      { signer },
    );

    await act(async () => {
      result.current.mutate({
        from: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
        to: "0x8888888888888888888888888888888888888888" as Address,
        amount: 100n,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("invalidates balance caches on success", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransferFrom({ tokenAddress: TOKEN }),
      { signer },
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resetSpy = vi.spyOn(queryClient, "resetQueries");

    await act(async () => {
      result.current.mutate({
        from: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address,
        to: "0x8888888888888888888888888888888888888888" as Address,
        amount: 100n,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialHandle.token(TOKEN),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialHandles.all,
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialBalance.token(TOKEN),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialBalances.all,
      }),
    );
  });
});

describe("useFinalizeUnwrap", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() => useFinalizeUnwrap({ tokenAddress: TOKEN }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.finalizeUnwrap on mutate", async () => {
    const signer = createMockSigner();
    const relayer = createRelayerWithValidDecrypt();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useFinalizeUnwrap({ tokenAddress: TOKEN }), {
      signer,
      relayer,
    });

    await act(async () => {
      result.current.mutate({ burnAmountHandle: "0xhandle" as Address });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signer.writeContract).toHaveBeenCalled();
    expect(relayer.publicDecrypt).toHaveBeenCalled();
  });

  it("invalidates balance caches on success", async () => {
    const signer = createMockSigner();
    const relayer = createRelayerWithValidDecrypt();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(
      () => useFinalizeUnwrap({ tokenAddress: TOKEN }),
      { signer, relayer },
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resetSpy = vi.spyOn(queryClient, "resetQueries");

    await act(async () => {
      result.current.mutate({ burnAmountHandle: "0xhandle" as Address });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialHandle.token(TOKEN),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialBalance.token(TOKEN),
      }),
    );
  });
});

describe("useUnwrap", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() => useUnwrap({ tokenAddress: TOKEN }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.unwrap on mutate", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useUnwrap({ tokenAddress: TOKEN }), { signer });

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("invalidates balance caches on success", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() => useUnwrap({ tokenAddress: TOKEN }), {
      signer,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resetSpy = vi.spyOn(queryClient, "resetQueries");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialHandle.token(TOKEN),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialBalance.token(TOKEN),
      }),
    );
  });
});

describe("useUnwrapAll", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() => useUnwrapAll({ tokenAddress: TOKEN }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.unwrapAll on mutate", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useUnwrapAll({ tokenAddress: TOKEN }), { signer });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("invalidates balance caches on success", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(
      () => useUnwrapAll({ tokenAddress: TOKEN }),
      { signer },
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resetSpy = vi.spyOn(queryClient, "resetQueries");

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialHandle.token(TOKEN),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialBalance.token(TOKEN),
      }),
    );
  });
});

describe("useUnshield", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useUnshield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("reports error when receipt has no UnwrapRequested event", async () => {
    // useUnshield orchestrates: unwrap -> waitForTransactionReceipt -> findUnwrapRequested -> finalizeUnwrap.
    // With the default mock returning { logs: [] }, findUnwrapRequested returns undefined,
    // causing a TransactionRevertedError.
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    const { result } = renderWithProviders(
      () => useUnshield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
      { signer },
    );

    await act(async () => {
      result.current.mutate({ amount: 300n });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain("UnwrapRequested");
  });
});

describe("useUnshieldAll", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useUnshieldAll({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("reports error when receipt has no UnwrapRequested event", async () => {
    // Same orchestration flow as useUnshield: unwrapAll -> receipt -> findUnwrapRequested -> finalizeUnwrap.
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    const { result } = renderWithProviders(
      () => useUnshieldAll({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
      { signer },
    );

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain("UnwrapRequested");
  });
});

describe("useShieldETH", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useShieldETH({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.shieldETH on mutate", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(
      () => useShieldETH({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
      { signer },
    );

    await act(async () => {
      result.current.mutate({ amount: 1000000000000000000n });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("accepts optional value parameter", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(
      () => useShieldETH({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
      { signer },
    );

    await act(async () => {
      result.current.mutate({
        amount: 1000000000000000000n,
        value: 2000000000000000000n,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("invalidates balance caches on success", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(
      () => useShieldETH({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
      { signer },
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resetSpy = vi.spyOn(queryClient, "resetQueries");

    await act(async () => {
      result.current.mutate({ amount: 1000000000000000000n });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialHandle.token(TOKEN),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.confidentialBalance.token(TOKEN),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

describe("useConfidentialBalance", () => {
  test("default", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    const handle = `0x${"aa".repeat(32)}` as Address;
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 123n });

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
      relayer,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const { data, dataUpdatedAt, handleQuery, ...state } = result.current;
    const { data: handleData, dataUpdatedAt: handleDataUpdatedAt, ...handleState } = handleQuery;
    expect(data).toBe(123n);
    expect(handleData).toBe(handle);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(handleDataUpdatedAt).toEqual(expect.any(Number));
    expect({ ...state, handleQuery: handleState }).toMatchInlineSnapshot(`
      {
        "error": null,
        "errorUpdateCount": 0,
        "errorUpdatedAt": 0,
        "failureCount": 0,
        "failureReason": null,
        "fetchStatus": "idle",
        "handleQuery": {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isStale": true,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        },
        "isEnabled": true,
        "isError": false,
        "isFetched": true,
        "isFetchedAfterMount": true,
        "isFetching": false,
        "isInitialLoading": false,
        "isLoading": false,
        "isLoadingError": false,
        "isPaused": false,
        "isPending": false,
        "isPlaceholderData": false,
        "isRefetchError": false,
        "isRefetching": false,
        "isStale": false,
        "isSuccess": true,
        "promise": Promise {
          "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
          "status": "rejected",
        },
        "refetch": [Function],
        "status": "success",
      }
    `);
  });

  test("error: disabled when getAddress fails", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockRejectedValue(new Error("no wallet"));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
    });

    await waitFor(() => expect(result.current.handleQuery.fetchStatus).toBe("idle"));
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.handleQuery.data).toBeUndefined();
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when signer address unavailable", () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.handleQuery.fetchStatus).toBe("idle");
  });

  test("behavior: disabled when handle is not yet resolved", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
    });

    await waitFor(() => expect(result.current.handleQuery.fetchStatus).toBe("fetching"));
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("behavior: disabled when handle undefined despite enabled=true", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalance({ tokenAddress: TOKEN }, { enabled: true }),
      {
        signer,
        relayer,
      },
    );

    await waitFor(() => expect(result.current.handleQuery.fetchStatus).toBe("fetching"));
    expect(result.current.fetchStatus).toBe("idle");
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  test("behavior: signer undefined -> defined", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    const handle = `0x${"ac".repeat(32)}` as Address;
    let resolveAddress: (value: Address) => void;
    const addressPromise = new Promise<Address>((resolve) => {
      resolveAddress = resolve;
    });

    vi.mocked(signer.getAddress).mockReturnValue(addressPromise);
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 321n });

    const { result, rerender } = renderWithProviders(
      () => useConfidentialBalance({ tokenAddress: TOKEN }),
      { signer, relayer },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    resolveAddress!(USER);
    rerender();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(321n);
  });

  describe("behavior: full lifecycle", () => {
    test("handle poll -> decrypt cascade", async () => {
      const signer = createMockSigner();
      const relayer = createMockRelayer();
      const handleA = `0x${"ab".repeat(32)}` as Address;
      const handleB = `0x${"bc".repeat(32)}` as Address;
      vi.mocked(signer.readContract).mockResolvedValueOnce(handleA).mockResolvedValueOnce(handleB);
      vi.mocked(relayer.userDecrypt).mockImplementation(async ({ handles }) => {
        const value = handles[0] === handleA ? 111n : 222n;
        return { [handles[0] as Address]: value };
      });

      const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
        signer,
        relayer,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
      expect(result.current.handleQuery.data).toBe(handleA);
      expect(result.current.data).toBe(111n);

      await act(async () => {
        await result.current.handleQuery.refetch();
      });

      await waitFor(() => expect(result.current.handleQuery.data).toBe(handleB), {
        timeout: 5_000,
      });
      await waitFor(() => expect(result.current.data).toBe(222n), { timeout: 5_000 });
      expect(relayer.userDecrypt).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ handles: [handleA] }),
      );
      expect(relayer.userDecrypt).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ handles: [handleB] }),
      );
    });
  });

  test("behavior: re-render preserves cached data", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    const handle = `0x${"ad".repeat(32)}` as Address;
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 999n });

    const { result, rerender } = renderWithProviders(
      () => useConfidentialBalance({ tokenAddress: TOKEN }),
      { signer, relayer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
    const firstData = result.current.data;

    rerender();

    expect(result.current.data).toBe(firstData);
  });
});

describe("useConfidentialBalances", () => {
  test("default", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    const tokenTwo = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
    const handleA = `0x${"ca".repeat(32)}` as Address;
    const handleB = `0x${"cb".repeat(32)}` as Address;
    vi.mocked(signer.readContract).mockResolvedValueOnce(handleA).mockResolvedValueOnce(handleB);
    vi.mocked(relayer.userDecrypt).mockResolvedValue({
      [handleA]: 10n,
      [handleB]: 20n,
    });

    const tokens = [TOKEN, tokenTwo];
    const { result } = renderWithProviders(() => useConfidentialBalances({ tokenAddresses: tokens }), {
      signer,
      relayer,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });

    const { data, dataUpdatedAt, handlesQuery, isStale: _isStale, ...state } = result.current;
    const {
      data: handlesData,
      dataUpdatedAt: handlesDataUpdatedAt,
      isStale: _handlesIsStale,
      ...handlesState
    } = handlesQuery;
    expect(data?.get(TOKEN)).toBe(10n);
    expect(data?.get(tokenTwo)).toBe(20n);
    expect(handlesData).toEqual([handleA, handleB]);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(handlesDataUpdatedAt).toEqual(expect.any(Number));
    expect({ ...state, handlesQuery: handlesState }).toMatchInlineSnapshot(`
      {
        "error": null,
        "errorUpdateCount": 0,
        "errorUpdatedAt": 0,
        "failureCount": 0,
        "failureReason": null,
        "fetchStatus": "idle",
        "handlesQuery": {
          "error": null,
          "errorUpdateCount": 0,
          "errorUpdatedAt": 0,
          "failureCount": 0,
          "failureReason": null,
          "fetchStatus": "idle",
          "isEnabled": true,
          "isError": false,
          "isFetched": true,
          "isFetchedAfterMount": true,
          "isFetching": false,
          "isInitialLoading": false,
          "isLoading": false,
          "isLoadingError": false,
          "isPaused": false,
          "isPending": false,
          "isPlaceholderData": false,
          "isRefetchError": false,
          "isRefetching": false,
          "isSuccess": true,
          "promise": Promise {
            "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
            "status": "rejected",
          },
          "refetch": [Function],
          "status": "success",
        },
        "isEnabled": true,
        "isError": false,
        "isFetched": true,
        "isFetchedAfterMount": true,
        "isFetching": false,
        "isInitialLoading": false,
        "isLoading": false,
        "isLoadingError": false,
        "isPaused": false,
        "isPending": false,
        "isPlaceholderData": false,
        "isRefetchError": false,
        "isRefetching": false,
        "isSuccess": true,
        "promise": Promise {
          "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
          "status": "rejected",
        },
        "refetch": [Function],
        "status": "success",
      }
    `);
  });

  test("behavior: disabled when tokenAddresses is empty", () => {
    const signer = createMockSigner();

    const { result } = renderWithProviders(() => useConfidentialBalances({ tokenAddresses: [] }), {
      signer,
    });

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.handlesQuery.fetchStatus).toBe("idle");
  });

  test("error: disabled when getAddress fails", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockRejectedValue(new Error("disconnected"));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }),
      { signer },
    );

    await waitFor(() => expect(result.current.handlesQuery.fetchStatus).toBe("idle"));
    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.handlesQuery.data).toBeUndefined();
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when signer address unavailable", () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }),
      { signer },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.handlesQuery.fetchStatus).toBe("idle");
  });

  test("behavior: disabled when owner unavailable despite enabled=true", () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }, { enabled: true }),
      { signer },
    );

    expect(result.current.handlesQuery.fetchStatus).toBe("idle");
    expect(result.current.fetchStatus).toBe("idle");
  });

  test("behavior: disabled when handles undefined despite enabled=true", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }, { enabled: true }),
      { signer, relayer },
    );

    await waitFor(() => expect(result.current.handlesQuery.fetchStatus).toBe("fetching"));
    expect(result.current.fetchStatus).toBe("idle");
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });

  test("behavior: signer undefined -> defined", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    const handle = `0x${"cc".repeat(32)}` as Address;
    let resolveAddress: (value: Address) => void;
    const addressPromise = new Promise<Address>((resolve) => {
      resolveAddress = resolve;
    });

    vi.mocked(signer.getAddress).mockReturnValue(addressPromise);
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(relayer.userDecrypt).mockResolvedValue({ [handle]: 456n });

    const { result, rerender } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }),
      { signer, relayer },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    resolveAddress!(USER);
    rerender();

    await waitFor(() => expect(result.current.isSuccess).toBe(true), { timeout: 5_000 });
    expect(result.current.data?.get(TOKEN)).toBe(456n);
  });
});

describe("useActivityFeed", () => {
  test("behavior: disabled when logs is undefined", () => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress: TOKEN,
        userAddress: USER,
        logs: undefined,
      }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("behavior: disabled when userAddress is undefined", () => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress: TOKEN,
        userAddress: undefined,
        logs: [],
      }),
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  test("default", async () => {
    const signer = createMockSigner();

    const { result } = renderWithProviders(
      () =>
        useActivityFeed({
          tokenAddress: TOKEN,
          userAddress: USER,
          logs: [],
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const { data, dataUpdatedAt, ...state } = result.current;
    expect(data).toEqual([]);
    expect(dataUpdatedAt).toEqual(expect.any(Number));
    expect(state).toMatchInlineSnapshot(`
      {
        "error": null,
        "errorUpdateCount": 0,
        "errorUpdatedAt": 0,
        "failureCount": 0,
        "failureReason": null,
        "fetchStatus": "idle",
        "isEnabled": true,
        "isError": false,
        "isFetched": true,
        "isFetchedAfterMount": true,
        "isFetching": false,
        "isInitialLoading": false,
        "isLoading": false,
        "isLoadingError": false,
        "isPaused": false,
        "isPending": false,
        "isPlaceholderData": false,
        "isRefetchError": false,
        "isRefetching": false,
        "isStale": false,
        "isSuccess": true,
        "promise": Promise {
          "reason": [Error: experimental_prefetchInRender feature flag is not enabled],
          "status": "rejected",
        },
        "refetch": [Function],
        "status": "success",
      }
    `);
  });

  test("behavior: params undefined -> defined", async () => {
    const signer = createMockSigner();
    const ctx = createWrapper({ signer });
    const { result, rerender } = renderHook(
      ({ userAddress, logs }) =>
        useActivityFeed({
          tokenAddress: TOKEN,
          userAddress,
          logs,
          decrypt: false,
        }),
      {
        wrapper: ctx.Wrapper,
        initialProps: {
          userAddress: undefined as Address | undefined,
          logs: undefined as [] | undefined,
        },
      },
    );

    expect(result.current.isPending).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");

    rerender({
      userAddress: USER,
      logs: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useUserDecryptedValue", () => {
  test("behavior: re-render preserves cached data", () => {
    const cached = 1000n;
    const ctx = createWrapper();
    ctx.queryClient.setQueryData(decryptionKeys.value("0xhandle"), cached);

    const { result, rerender } = renderHook(() => useUserDecryptedValue("0xhandle"), {
      wrapper: ctx.Wrapper,
    });

    const firstData = result.current.data;
    rerender();

    expect(firstData).toBe(cached);
    expect(result.current.data).toBe(firstData);
  });
});
