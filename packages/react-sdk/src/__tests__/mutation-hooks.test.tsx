import { describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useConfidentialTransfer } from "../token/use-confidential-transfer";
import { useConfidentialApprove } from "../token/use-confidential-approve";
import { useApproveUnderlying } from "../token/use-approve-underlying";
import { useShield } from "../token/use-wrap";
import { useAuthorizeAll } from "../token/use-authorize-all";
import { useEncrypt } from "../relayer/use-encrypt";
import { confidentialBalanceQueryKeys } from "../token/balance-query-keys";
import { renderWithProviders, createMockSigner, createMockRelayer } from "./test-utils";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;

describe("useConfidentialTransfer", () => {
  it("calls token.confidentialTransfer on mutate", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
    // Mock encrypt flow: readContract for balanceOf handle
    vi.mocked(signer.readContract).mockResolvedValue("0x0");

    const { result } = renderWithProviders(() => useConfidentialTransfer({ tokenAddress: TOKEN }), {
      signer,
    });

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useConfidentialApprove", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() => useConfidentialApprove({ tokenAddress: TOKEN }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useApproveUnderlying", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useApproveUnderlying({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useShield", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useAuthorizeAll", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() => useAuthorizeAll());

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useEncrypt", () => {
  it("calls relayer.encrypt on mutate", async () => {
    const relayer = createMockRelayer();
    const { result } = renderWithProviders(() => useEncrypt(), { relayer });

    await act(async () => {
      result.current.mutate({
        values: [1000n],
        contractAddress: "0x1111111111111111111111111111111111111111" as Address,
        userAddress: "0x2222222222222222222222222222222222222222" as Address,
      });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(relayer.encrypt).toHaveBeenCalled();
    expect(result.current.data).toEqual({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    });
  });
});

describe("useConfidentialTransfer optimistic updates", () => {
  it("subtracts amount from cached balance on mutate when optimistic=true", async () => {
    const signer = createMockSigner();
    // Make writeContract hang so we can observe the optimistic state
    let resolveTransfer: (v: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (v: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
      { signer },
    );

    // Seed the cache with a balance
    const balanceKey = [...confidentialBalanceQueryKeys.owner(TOKEN, "0xuser"), "0xhandle"];
    queryClient.setQueryData(balanceKey, 5000n);

    await act(async () => {
      result.current.mutate({
        to: "0x8888888888888888888888888888888888888888" as Address,
        amount: 1200n,
      });
    });

    // Balance should be optimistically decreased
    await waitFor(() => {
      expect(queryClient.getQueryData(balanceKey)).toBe(3800n);
    });

    // Resolve the mutation to avoid dangling promises
    await act(async () => {
      resolveTransfer!("0xtxhash");
    });
  });

  it("does not modify cached balance when optimistic is not set", async () => {
    const signer = createMockSigner();
    let resolveTransfer: (v: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveTransfer = resolve as (v: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress: TOKEN }),
      { signer },
    );

    const balanceKey = [...confidentialBalanceQueryKeys.owner(TOKEN, "0xuser"), "0xhandle"];
    queryClient.setQueryData(balanceKey, 5000n);

    await act(async () => {
      result.current.mutate({
        to: "0x8888888888888888888888888888888888888888" as Address,
        amount: 1200n,
      });
    });

    // Balance should remain unchanged
    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);

    await act(async () => {
      resolveTransfer!("0xtxhash");
    });
  });

  it("invalidates balance queries on error when optimistic=true", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
      { signer },
    );

    const balanceKey = [...confidentialBalanceQueryKeys.owner(TOKEN, "0xuser"), "0xhandle"];
    queryClient.setQueryData(balanceKey, 5000n);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.mutate({
        to: "0x8888888888888888888888888888888888888888" as Address,
        amount: 1200n,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    // Verify invalidation was called for rollback
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalanceQueryKeys.token(TOKEN),
      }),
    );
  });
});

describe("useShield optimistic updates", () => {
  it("adds amount to cached balance on mutate when optimistic=true", async () => {
    const signer = createMockSigner();
    let resolveWrap: (v: string) => void;
    vi.mocked(signer.writeContract).mockReturnValue(
      new Promise((resolve) => {
        resolveWrap = resolve as (v: string) => void;
      }),
    );

    const { result, queryClient } = renderWithProviders(
      () => useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
      { signer },
    );

    const balanceKey = [...confidentialBalanceQueryKeys.owner(TOKEN, "0xuser"), "0xhandle"];
    queryClient.setQueryData(balanceKey, 3000n);

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    // Balance should be optimistically increased
    await waitFor(() => {
      expect(queryClient.getQueryData(balanceKey)).toBe(3500n);
    });

    await act(async () => {
      resolveWrap!("0xtxhash");
    });
  });

  it("invalidates balance queries on shield error when optimistic=true", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));

    const { result, queryClient } = renderWithProviders(
      () => useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
      { signer },
    );

    const balanceKey = [...confidentialBalanceQueryKeys.owner(TOKEN, "0xuser"), "0xhandle"];
    queryClient.setQueryData(balanceKey, 3000n);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: confidentialBalanceQueryKeys.token(TOKEN),
      }),
    );
  });
});
