import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock @zama-fhe/sdk/viem
vi.mock("@zama-fhe/sdk/viem", () => ({
  readConfidentialBalanceOfContract: vi.fn().mockResolvedValue(42n),
  readSupportsInterfaceContract: vi.fn().mockResolvedValue(true),
  readWrapperForTokenContract: vi.fn().mockResolvedValue("0xwrapper"),
}));

const viemMocks = await import("@zama-fhe/sdk/viem");
const {
  readConfidentialBalanceOfContract,
  readSupportsInterfaceContract,
  readWrapperForTokenContract,
} = vi.mocked(viemMocks);

import { useConfidentialBalanceOfSuspense } from "../viem/use-confidential-balance-of";
import { useSupportsInterfaceSuspense } from "../viem/use-supports-interface";
import { useWrapperForTokenSuspense } from "../viem/use-wrapper-for-token";

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

describe("useConfidentialBalanceOfSuspense", () => {
  it("fetches balance via suspense", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useConfidentialBalanceOfSuspense({
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
});

describe("useSupportsInterfaceSuspense", () => {
  it("fetches interface support via suspense", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useSupportsInterfaceSuspense({
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

describe("useWrapperForTokenSuspense", () => {
  it("fetches wrapper address via suspense", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useWrapperForTokenSuspense({
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
