import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock @zama-fhe/sdk/ethers
vi.mock("@zama-fhe/sdk/ethers", () => ({
  writeConfidentialTransferContract: vi.fn().mockResolvedValue("0xtxhash"),
  readConfidentialBalanceOfContract: vi.fn().mockResolvedValue(42n),
  writeWrapContract: vi.fn().mockResolvedValue("0xwraphash"),
  readWrapperForTokenContract: vi.fn().mockResolvedValue("0xwrapper"),
}));

const ethersMocks = await import("@zama-fhe/sdk/ethers");
const {
  writeConfidentialTransferContract,
  readConfidentialBalanceOfContract,
  writeWrapContract,
  readWrapperForTokenContract,
} = vi.mocked(ethersMocks);

import { useConfidentialTransfer } from "../ethers/use-confidential-transfer";
import { useConfidentialBalanceOf } from "../ethers/use-confidential-balance-of";
import { useShield } from "../ethers/use-wrap";
import { useWrapperForToken } from "../ethers/use-wrapper-for-token";

type Address = `0x${string}`;

const mockSigner = {} as never;
const mockProvider = {} as never;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useConfidentialTransfer", () => {
  it("calls writeConfidentialTransferContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useConfidentialTransfer(), { wrapper });

    const handle = new Uint8Array([1, 2, 3]);
    const inputProof = new Uint8Array([4, 5, 6]);
    result.current.mutate({
      signer: mockSigner,
      tokenAddress: "0xtoken" as Address,
      to: "0xto" as Address,
      handle,
      inputProof,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeConfidentialTransferContract).toHaveBeenCalledWith(
      mockSigner,
      "0xtoken",
      "0xto",
      handle,
      inputProof,
    );
    expect(result.current.data).toBe("0xtxhash");
  });
});

describe("useConfidentialBalanceOf", () => {
  it("fetches balance when enabled", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useConfidentialBalanceOf({
          provider: mockProvider,
          tokenAddress: "0xtoken" as Address,
          userAddress: "0xuser" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readConfidentialBalanceOfContract).toHaveBeenCalledWith(
      mockProvider,
      "0xtoken",
      "0xuser",
    );
    expect(result.current.data).toBe(42n);
  });
});

describe("useShield", () => {
  it("calls writeWrapContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useShield(), { wrapper });

    result.current.mutate({
      signer: mockSigner,
      wrapperAddress: "0xwrapper" as Address,
      to: "0xto" as Address,
      amount: 100n,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeWrapContract).toHaveBeenCalledWith(mockSigner, "0xwrapper", "0xto", 100n);
  });
});

describe("useWrapperForToken", () => {
  it("fetches wrapper address when enabled", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useWrapperForToken({
          provider: mockProvider,
          coordinator: "0xcoord" as Address,
          tokenAddress: "0xtoken" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readWrapperForTokenContract).toHaveBeenCalledWith(mockProvider, "0xcoord", "0xtoken");
    expect(result.current.data).toBe("0xwrapper");
  });
});
