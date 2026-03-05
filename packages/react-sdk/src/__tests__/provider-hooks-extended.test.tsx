import { describe, expect, it, vi } from "../test-fixtures";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/sdk";
import { useUnderlyingAllowance } from "../token/use-underlying-allowance";
import { useUnshield } from "../token/use-unshield";
import { useUnshieldAll } from "../token/use-unshield-all";
import { useMetadataSuspense } from "../token/use-metadata";
import { useTotalSupplySuspense } from "../token/use-total-supply";
import { useWrapperDiscoverySuspense } from "../token/use-wrapper-discovery";

describe("useUnderlyingAllowance", () => {
  it("returns allowance value", async ({
    signer,
    tokenAddress,
    wrapperAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("0x5555555555555555555555555555555555555555")
      .mockResolvedValueOnce(5000n);

    const { result } = renderWithProviders(
      () =>
        useUnderlyingAllowance({
          tokenAddress,
          wrapperAddress,
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(5000n);
    expect(signer.readContract).toHaveBeenCalled();
  });
});

describe("useUnshield", () => {
  it("provides mutate function", ({ tokenAddress, wrapperAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnshield({ tokenAddress, wrapperAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useUnshieldAll", () => {
  it("provides mutate function", ({ tokenAddress, wrapperAddress, renderWithProviders }) => {
    const { result } = renderWithProviders(() => useUnshieldAll({ tokenAddress, wrapperAddress }));

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useMetadataSuspense", () => {
  it("returns metadata via suspense", async ({ signer, tokenAddress, renderWithProviders }) => {
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("TestToken")
      .mockResolvedValueOnce("TT")
      .mockResolvedValueOnce(18);

    const { result } = renderWithProviders(() => useMetadataSuspense(tokenAddress), {
      signer,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
  });
});

describe("useTotalSupplySuspense", () => {
  it("returns total supply via suspense", async ({ signer, tokenAddress, renderWithProviders }) => {
    vi.mocked(signer.readContract).mockResolvedValue(100000n);

    const { result } = renderWithProviders(() => useTotalSupplySuspense(tokenAddress), {
      signer,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(100000n);
  });
});

describe("useWrapperDiscoverySuspense", () => {
  it("returns wrapper address via suspense", async ({
    signer,
    tokenAddress,
    renderWithProviders,
  }) => {
    vi.mocked(signer.readContract).mockResolvedValue(
      "0x4444444444444444444444444444444444444444" as Address,
    );

    const { result } = renderWithProviders(
      () =>
        useWrapperDiscoverySuspense({
          tokenAddress,
          coordinatorAddress: "0x5555555555555555555555555555555555555555" as Address,
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
