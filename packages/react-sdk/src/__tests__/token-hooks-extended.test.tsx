import { describe, expect, it, vi } from "../test-fixtures";
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
import {
  confidentialBalanceQueryKeys,
  confidentialBalancesQueryKeys,
  confidentialHandleQueryKeys,
  confidentialHandlesQueryKeys,
} from "../token/balance-query-keys";

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe("useConfidentialTransferFrom", () => {
  it("provides mutate function", ({ tokenAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useConfidentialTransferFrom({ tokenAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.confidentialTransferFrom on mutateAsync", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useConfidentialTransferFrom({ tokenAddress }), {
      signer,
    });

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

  it("invalidates balance caches on success", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransferFrom({ tokenAddress }),
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
        queryKey: confidentialHandleQueryKeys.token(tokenAddress),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialHandlesQueryKeys.all,
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalanceQueryKeys.token(tokenAddress),
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalancesQueryKeys.all,
      }),
    );
  });
});

describe("useFinalizeUnwrap", () => {
  it("provides mutate function", ({ tokenAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useFinalizeUnwrap({ tokenAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.finalizeUnwrap on mutate", async ({
    signer,
    relayer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.publicDecrypt).mockResolvedValue({
      clearValues: {},
      abiEncodedClearValues: "0x0",
      decryptionProof: "0xproof",
    } as never);
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useFinalizeUnwrap({ tokenAddress }), {
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

  it("invalidates balance caches on success", async ({
    signer,
    relayer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(relayer.publicDecrypt).mockResolvedValue({
      clearValues: {},
      abiEncodedClearValues: "0x0",
      decryptionProof: "0xproof",
    } as never);
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() => useFinalizeUnwrap({ tokenAddress }), {
      signer,
      relayer,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resetSpy = vi.spyOn(queryClient, "resetQueries");

    await act(async () => {
      result.current.mutate({ burnAmountHandle: "0xhandle" as Address });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialHandleQueryKeys.token(tokenAddress),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalanceQueryKeys.token(tokenAddress),
      }),
    );
  });
});

describe("useUnwrap", () => {
  it("provides mutate function", ({ tokenAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnwrap({ tokenAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.unwrap on mutate", async ({ signer, tokenAddress, renderWithProviders }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useUnwrap({ tokenAddress }), {
      signer,
    });

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("invalidates balance caches on success", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() => useUnwrap({ tokenAddress }), {
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
        queryKey: confidentialHandleQueryKeys.token(tokenAddress),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalanceQueryKeys.token(tokenAddress),
      }),
    );
  });
});

describe("useUnwrapAll", () => {
  it("provides mutate function", ({ tokenAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnwrapAll({ tokenAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.unwrapAll on mutate", async ({
    signer,
    handle,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useUnwrapAll({ tokenAddress }), {
      signer,
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("invalidates balance caches on success", async ({
    signer,
    handle,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(() => useUnwrapAll({ tokenAddress }), {
      signer,
    });

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const resetSpy = vi.spyOn(queryClient, "resetQueries");

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialHandleQueryKeys.token(tokenAddress),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalanceQueryKeys.token(tokenAddress),
      }),
    );
  });
});

describe("useUnshield", () => {
  it("provides mutate function", ({ tokenAddress, wrapperAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnshield({ tokenAddress, wrapperAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("reports error when receipt has no UnwrapRequested event", async ({
    signer,
    tokenAddress,
    wrapperAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    const { result } = renderWithProviders(() => useUnshield({ tokenAddress, wrapperAddress }), {
      signer,
    });

    await act(async () => {
      result.current.mutate({ amount: 300n });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain("UnwrapRequested");
  });
});

describe("useUnshieldAll", () => {
  it("provides mutate function", ({ tokenAddress, wrapperAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnshieldAll({ tokenAddress, wrapperAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("reports error when receipt has no UnwrapRequested event", async ({
    signer,
    handle,
    tokenAddress,
    wrapperAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(handle);
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
    vi.mocked(signer.waitForTransactionReceipt).mockResolvedValue({ logs: [] });

    const { result } = renderWithProviders(() => useUnshieldAll({ tokenAddress, wrapperAddress }), {
      signer,
    });

    await act(async () => {
      result.current.mutate();
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toContain("UnwrapRequested");
  });
});

describe("useShieldETH", () => {
  it("provides mutate function", ({ tokenAddress, wrapperAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useShieldETH({ tokenAddress, wrapperAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });

  it("calls token.shieldETH on mutate", async ({
    signer,
    tokenAddress,
    wrapperAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useShieldETH({ tokenAddress, wrapperAddress }), {
      signer,
    });

    await act(async () => {
      result.current.mutate({ amount: 1000000000000000000n });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(signer.writeContract).toHaveBeenCalled();
  });

  it("accepts optional value parameter", async ({
    signer,
    tokenAddress,
    wrapperAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result } = renderWithProviders(() => useShieldETH({ tokenAddress, wrapperAddress }), {
      signer,
    });

    await act(async () => {
      result.current.mutate({
        amount: 1000000000000000000n,
        value: 2000000000000000000n,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("invalidates balance caches on success", async ({
    signer,
    tokenAddress,
    wrapperAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

    const { result, queryClient } = renderWithProviders(
      () => useShieldETH({ tokenAddress, wrapperAddress }),
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
        queryKey: confidentialHandleQueryKeys.token(tokenAddress),
      }),
    );
    expect(resetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalanceQueryKeys.token(tokenAddress),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

describe("useConfidentialBalance", () => {
  it("resolves the handle via phase 1 polling", async ({
    signer,
    handle,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(handle);

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress }), {
      signer,
    });

    await waitFor(() => expect(result.current.handleQuery.isSuccess).toBe(true));
    expect(result.current.handleQuery.data).toBe(handle);
  });

  it("disables downstream queries when getAddress fails", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.getAddress).mockRejectedValue(new Error("no wallet"));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress }), {
      signer,
    });

    await waitFor(() => expect(result.current.handleQuery.isFetching).toBe(false));
    expect(result.current.handleQuery.data).toBeUndefined();
    expect(result.current.data).toBeUndefined();
  });

  it("does not fetch when signer address is unavailable", ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress }), {
      signer,
    });

    expect(result.current.handleQuery.isFetching).toBe(false);
  });

  it("balance query stays disabled when handle is not yet resolved", ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress }), {
      signer,
    });

    expect(result.current.isFetching).toBe(false);
  });
});

describe("useConfidentialBalances", () => {
  it("resolves handles for multiple tokens", async ({
    signer,
    handle,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(handle);

    const tokens = [tokenAddress, "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address];

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: tokens }),
      { signer },
    );

    await waitFor(() => expect(result.current.handlesQuery.isSuccess).toBe(true));
    expect(result.current.handlesQuery.data).toHaveLength(2);
  });

  it("stays idle when tokenAddresses is empty", ({ signer, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useConfidentialBalances({ tokenAddresses: [] }), {
      signer,
    });

    expect(result.current.handlesQuery.isFetching).toBe(false);
  });

  it("disables downstream queries when getAddress fails", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.getAddress).mockRejectedValue(new Error("disconnected"));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [tokenAddress] }),
      { signer },
    );

    await waitFor(() => expect(result.current.handlesQuery.isFetching).toBe(false));
    expect(result.current.handlesQuery.data).toBeUndefined();
    expect(result.current.data).toBeUndefined();
  });

  it("does not fetch when signer address is unavailable", ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.getAddress).mockReturnValue(new Promise(() => {}));

    const { result } = renderWithProviders(
      () => useConfidentialBalances({ tokenAddresses: [tokenAddress] }),
      { signer },
    );

    expect(result.current.handlesQuery.isFetching).toBe(false);
  });
});

describe("useActivityFeed", () => {
  it("stays idle when logs is undefined", ({ tokenAddress, userAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress,
        userAddress,
        logs: undefined,
      }),
    );

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("stays idle when userAddress is undefined", ({ tokenAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() =>
      useActivityFeed({
        tokenAddress,
        userAddress: undefined,
        logs: [],
      }),
    );

    expect(result.current.isFetching).toBe(false);
    expect(result.current.data).toBeUndefined();
  });

  it("returns empty array when logs is empty", async ({
    signer,
    tokenAddress,
    userAddress,
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(
      () =>
        useActivityFeed({
          tokenAddress,
          userAddress,
          logs: [],
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("is enabled when both userAddress and logs are provided", async ({
    signer,
    tokenAddress,
    userAddress,
    renderWithProviders,
  }) => {
    const { result } = renderWithProviders(
      () =>
        useActivityFeed({
          tokenAddress,
          userAddress,
          logs: [],
          decrypt: false,
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
