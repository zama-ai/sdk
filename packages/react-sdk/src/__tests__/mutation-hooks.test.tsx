import { describe, expect, it, vi } from "vitest";
import { act, waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useConfidentialTransfer } from "../token/use-confidential-transfer";
import { useConfidentialApprove } from "../token/use-confidential-approve";
import { useApproveUnderlying } from "../token/use-approve-underlying";
import { useShield } from "../token/use-shield";
import { useAuthorizeAll } from "../token/use-authorize-all";
import { useEncrypt } from "../relayer/use-encrypt";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";
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

  it("invalidates underlying allowance cache on success and calls user onSuccess", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address)
      .mockResolvedValueOnce(0n);

    const onSuccess = vi.fn();
    const { result, queryClient } = renderWithProviders(
      () =>
        useApproveUnderlying(
          { tokenAddress: TOKEN, wrapperAddress: WRAPPER },
          {
            onSuccess,
          },
        ),
      { signer },
    );
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      result.current.mutate({ amount: 100n });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: zamaQueryKeys.underlyingAllowance.all,
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
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
    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
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

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
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

  it("restores cached balance on error when optimistic=true without invalidation", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("tx reverted"));

    const { result, queryClient } = renderWithProviders(
      () => useConfidentialTransfer({ tokenAddress: TOKEN, optimistic: true }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 5000n);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({
        to: "0x8888888888888888888888888888888888888888" as Address,
        amount: 1200n,
      });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(5000n);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3800n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 5000n);
  });
});

describe("useShield optimistic updates", () => {
  it("adds amount to cached balance on mutate when optimistic=true", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address)
      .mockResolvedValueOnce(5000n);

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

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 3000n);
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    // The optimistic value should be written before the mutation settles.
    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3500n);
    });

    await act(async () => {
      resolveWrap!("0xtxhash");
    });
  });

  it("restores cached balance snapshot on shield error when optimistic=true without refetch", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address)
      .mockResolvedValueOnce(5000n);
    vi.mocked(signer.writeContract).mockRejectedValue(new Error("shield failed"));

    const { result, queryClient } = renderWithProviders(
      () => useShield({ tokenAddress: TOKEN, wrapperAddress: WRAPPER, optimistic: true }),
      { signer },
    );

    const balanceKey = zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle");
    queryClient.setQueryData(balanceKey, 3000n);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const setQueryDataSpy = vi.spyOn(queryClient, "setQueryData");

    await act(async () => {
      result.current.mutate({ amount: 500n });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(queryClient.getQueryData(balanceKey)).toBe(3000n);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3500n);
    expect(setQueryDataSpy).toHaveBeenCalledWith(balanceKey, 3000n);
  });
});
