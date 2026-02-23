import { describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { Address } from "@zama-fhe/token-sdk";
import { useUnderlyingAllowance } from "../token/use-underlying-allowance";
import { useUnshield } from "../token/use-unshield";
import { useUnshieldAll } from "../token/use-unshield-all";
import { useTokenMetadataSuspense } from "../token/use-token-metadata";
import { useTotalSupplySuspense } from "../token/use-total-supply";
import { useWrapperDiscoverySuspense } from "../token/use-wrapper-discovery";
import { renderWithProviders, createMockSigner } from "./test-utils";

const TOKEN = "0xtoken" as Address;
const WRAPPER = "0xwrapper" as Address;

describe("useUnderlyingAllowance", () => {
  it("returns allowance value", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(5000n);

    const { result } = renderWithProviders(
      () =>
        useUnderlyingAllowance({
          tokenAddress: TOKEN,
          wrapperAddress: WRAPPER,
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(5000n);
    expect(signer.readContract).toHaveBeenCalled();
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
});

describe("useUnshieldAll", () => {
  it("provides mutate function", () => {
    const { result } = renderWithProviders(() =>
      useUnshieldAll({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    );

    expect(result.current.mutate).toBeDefined();
    expect(result.current.isIdle).toBe(true);
  });
});

describe("useTokenMetadataSuspense", () => {
  it("returns metadata via suspense", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract)
      .mockResolvedValueOnce("TestToken")
      .mockResolvedValueOnce("TT")
      .mockResolvedValueOnce(18);

    const { result } = renderWithProviders(() => useTokenMetadataSuspense(TOKEN), { signer });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ name: "TestToken", symbol: "TT", decimals: 18 });
  });
});

describe("useTotalSupplySuspense", () => {
  it("returns total supply via suspense", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue(100000n);

    const { result } = renderWithProviders(() => useTotalSupplySuspense(TOKEN), { signer });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(100000n);
  });
});

describe("useWrapperDiscoverySuspense", () => {
  it("returns wrapper address via suspense", async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValue("0xwrapper" as Address);

    const { result } = renderWithProviders(
      () =>
        useWrapperDiscoverySuspense({
          tokenAddress: TOKEN,
          coordinatorAddress: "0xcoordinator" as Address,
        }),
      { signer },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
