import { describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
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
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
import { renderWithProviders, createMockSigner, createMockRelayer } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;

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

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
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

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

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
  it("resolves the handle via phase 1 polling", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue("0xbalancehandle" as Address);

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
    });

    await waitFor(() => expect(result.current.handleQuery.isSuccess).toBe(true));
    expect(result.current.handleQuery.data).toBe("0xbalancehandle");
  });

  it("disables downstream queries when getAddress fails", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockRejectedValue(new Error("no wallet"));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
    });

    // Wait for the address query to settle in error state
    await waitFor(() => expect(result.current.handleQuery.isFetching).toBe(false));
    // The handle and balance queries should stay disabled since signerAddress is undefined
    expect(result.current.handleQuery.data).toBeUndefined();
    expect(result.current.data).toBeUndefined();
  });

  it("does not fetch when signer address is unavailable", () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
    });

    expect(result.current.handleQuery.isFetching).toBe(false);
  });

  it("balance query stays disabled when handle is not yet resolved", () => {
    const signer = createMockSigner();
    // readContract never resolves, so handle stays undefined
    vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), {
      signer,
    });

    // The balance (phase 2) query should not be fetching without a handle
    expect(result.current.isFetching).toBe(false);
  });

  it("does not run decrypt query when options.enabled=true but handle is undefined", async () => {
    const signer = createMockSigner();
    const relayer = createMockRelayer();
    // Keep phase 1 unresolved so handle remains undefined
    vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalance({ tokenAddress: TOKEN }, { enabled: true }),
      {
        signer,
        relayer,
      },
    );

    await waitFor(() => expect(result.current.handleQuery.isFetching).toBe(true));
    expect(result.current.isFetching).toBe(false);
    expect(relayer.userDecrypt).not.toHaveBeenCalled();
  });
});

describe("useConfidentialBalances", () => {
  it("resolves handles for multiple tokens", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue("0xhandle" as Address);

    const tokens = [TOKEN, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address];

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: tokens }),
      { signer },
    );

    await waitFor(() => expect(result.current.handlesQuery.isSuccess).toBe(true));
    expect(result.current.handlesQuery.data).toHaveLength(2);
  });

  it("stays idle when tokenAddresses is empty", () => {
    const signer = createMockSigner();

    const { result } = renderWithProviders(() => useConfidentialBalances({ tokenAddresses: [] }), {
      signer,
    });

    expect(result.current.handlesQuery.isFetching).toBe(false);
  });

  it("disables downstream queries when getAddress fails", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockRejectedValue(new Error("disconnected"));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }),
      { signer },
    );

    // Wait for the address query to settle in error state
    await waitFor(() => expect(result.current.handlesQuery.isFetching).toBe(false));
    // The handles and balances queries should stay disabled since signerAddress is undefined
    expect(result.current.handlesQuery.data).toBeUndefined();
    expect(result.current.data).toBeUndefined();
  });

  it("does not fetch when signer address is unavailable", () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }),
      { signer },
    );

    expect(result.current.handlesQuery.isFetching).toBe(false);
  });

  it("keeps decrypt query disabled when options.enabled=true but owner is unavailable", () => {
    const signer = createMockSigner();
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [TOKEN] }, { enabled: true }),
      { signer },
    );

    expect(result.current.handlesQuery.isFetching).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useActivityFeed", () => {
  it("stays idle when logs is undefined", () => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress: TOKEN,
        userAddress: "0x2222222222222222222222222222222222222222" as Address,
        logs: undefined,
      }),
    );

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("stays idle when userAddress is undefined", () => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress: TOKEN,
        userAddress: undefined,
        logs: [],
      }),
    );

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("returns empty array when logs is empty", async () => {
    const signer = createMockSigner();

    const { result } = renderWithProviders(
      () =>
        useActivityFeed({
          tokenAddress: TOKEN,
          userAddress: "0x2222222222222222222222222222222222222222" as Address,
          logs: [],
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("is enabled when both userAddress and logs are provided", async () => {
    const signer = createMockSigner();

    const { result } = renderWithProviders(
      () =>
        useActivityFeed({
          tokenAddress: TOKEN,
          userAddress: "0x2222222222222222222222222222222222222222" as Address,
          logs: [],
          decrypt: false,
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
