import { describe, expect, it, vi } from "../test-fixtures";
import { waitFor } from "@testing-library/react";
import { ERC7984_WRAPPER_INTERFACE_ID } from "@zama-fhe/sdk";
import type { Address } from "@zama-fhe/sdk";
import { useUnderlyingAllowance } from "../shield/use-underlying-allowance";
import { useUnshield } from "../unshield/use-unshield";
import { useUnshieldAll } from "../unshield/use-unshield-all";
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
      .mockResolvedValueOnce("0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e")
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
    vi.mocked(signer.readContract).mockImplementation(async (config) => {
      if (config.functionName === "supportsInterface") {
        return config.args[0] === ERC7984_WRAPPER_INTERFACE_ID;
      }
      return 100000n;
    });

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
    const wrapperAddr = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
    vi.mocked(signer.getChainId).mockResolvedValue(1);
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce([true, wrapperAddr])
      .mockResolvedValueOnce(true);

    const { result } = renderWithProviders(
      () =>
        useWrapperDiscoverySuspense({
          tokenAddress,
          erc20Address: "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address,
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
