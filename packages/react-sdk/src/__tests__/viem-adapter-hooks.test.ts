import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock @zama-fhe/sdk/viem
vi.mock("@zama-fhe/sdk/viem", () => ({
  writeConfidentialTransferContract: vi.fn().mockResolvedValue("0xtxhash"),
  readConfidentialBalanceOfContract: vi.fn().mockResolvedValue(42n),
  writeWrapContract: vi.fn().mockResolvedValue("0xwraphash"),
  readWrapperForTokenContract: vi.fn().mockResolvedValue("0xwrapper"),
  readSupportsInterfaceContract: vi.fn().mockResolvedValue(true),
}));

const viemMocks = await import("@zama-fhe/sdk/viem");
const {
  writeConfidentialTransferContract,
  readConfidentialBalanceOfContract,
  writeWrapContract,
  readWrapperForTokenContract,
  readSupportsInterfaceContract,
} = vi.mocked(viemMocks);

import { useConfidentialTransfer } from "../viem/use-confidential-transfer";
import { useConfidentialBalanceOf } from "../viem/use-confidential-balance-of";
import { useWrap } from "../viem/use-wrap";
import { useWrapperForToken } from "../viem/use-wrapper-for-token";
import { useSupportsInterface } from "../viem/use-supports-interface";

type Address = `0x${string}`;

const mockClient = {} as never;

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
      client: mockClient,
      tokenAddress: "0xtoken" as Address,
      to: "0xto" as Address,
      handle,
      inputProof,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeConfidentialTransferContract).toHaveBeenCalledWith(
      mockClient,
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
          client: mockClient,
          tokenAddress: "0xtoken" as Address,
          userAddress: "0xuser" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readConfidentialBalanceOfContract).toHaveBeenCalledWith(mockClient, "0xtoken", "0xuser");
    expect(result.current.data).toBe(42n);
  });

  it("is disabled when tokenAddress is undefined", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useConfidentialBalanceOf({
          client: mockClient,
          tokenAddress: undefined,
          userAddress: "0xuser" as Address,
        }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(readConfidentialBalanceOfContract).not.toHaveBeenCalled();
  });
});

describe("useWrap", () => {
  it("calls writeWrapContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useWrap(), { wrapper });

    result.current.mutate({
      client: mockClient,
      wrapperAddress: "0xwrapper" as Address,
      to: "0xto" as Address,
      amount: 100n,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeWrapContract).toHaveBeenCalledWith(mockClient, "0xwrapper", "0xto", 100n);
  });
});

describe("useWrapperForToken", () => {
  it("fetches wrapper address when enabled", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useWrapperForToken({
          client: mockClient,
          coordinator: "0xcoord" as Address,
          tokenAddress: "0xtoken" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readWrapperForTokenContract).toHaveBeenCalledWith(mockClient, "0xcoord", "0xtoken");
    expect(result.current.data).toBe("0xwrapper");
  });
});

describe("useSupportsInterface", () => {
  it("fetches interface support when enabled", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSupportsInterface({
          client: mockClient,
          tokenAddress: "0xtoken" as Address,
          interfaceId: "0x01ffc9a7" as `0x${string}`,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readSupportsInterfaceContract).toHaveBeenCalledWith(mockClient, "0xtoken", "0x01ffc9a7");
    expect(result.current.data).toBe(true);
  });
});
