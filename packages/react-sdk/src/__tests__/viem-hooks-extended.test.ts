import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mock @zama-fhe/sdk/viem
vi.mock("@zama-fhe/sdk/viem", () => ({
  writeConfidentialBatchTransferContract: vi.fn().mockResolvedValue("0xbatchhash"),
  writeUnwrapContract: vi.fn().mockResolvedValue("0xunwraphash"),
  writeUnwrapFromBalanceContract: vi.fn().mockResolvedValue("0xunwrapbalancehash"),
  writeFinalizeUnwrapContract: vi.fn().mockResolvedValue("0xfinalizehash"),
  writeSetOperatorContract: vi.fn().mockResolvedValue("0xoperatorhash"),
  writeWrapETHContract: vi.fn().mockResolvedValue("0xwrapethhash"),
  readUnderlyingTokenContract: vi.fn().mockResolvedValue("0xunderlying"),
  readWrapperExistsContract: vi.fn().mockResolvedValue(true),
}));

const viemMocks = await import("@zama-fhe/sdk/viem");
const {
  writeConfidentialBatchTransferContract,
  writeUnwrapContract,
  writeUnwrapFromBalanceContract,
  writeFinalizeUnwrapContract,
  writeSetOperatorContract,
  writeWrapETHContract,
  readUnderlyingTokenContract,
  readWrapperExistsContract,
} = vi.mocked(viemMocks);

import { useConfidentialBatchTransfer } from "../viem/use-confidential-batch-transfer";
import { useUnwrap } from "../viem/use-unwrap";
import { useUnwrapFromBalance } from "../viem/use-unwrap-from-balance";
import { useFinalizeUnwrap } from "../viem/use-finalize-unwrap";
import { useSetOperator } from "../viem/use-set-operator";
import { useWrapETH } from "../viem/use-wrap-eth";
import { useUnderlyingToken, useUnderlyingTokenSuspense } from "../viem/use-underlying-token";
import { useWrapperExists, useWrapperExistsSuspense } from "../viem/use-wrapper-exists";

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

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

describe("useConfidentialBatchTransfer", () => {
  it("calls writeConfidentialBatchTransferContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useConfidentialBatchTransfer(), { wrapper });

    const batchTransferData = [
      {
        to: "0xrecipient1" as Address,
        encryptedAmount: "0xhandle1" as Address,
        inputProof: "0xproof1" as Address,
        retryFor: 0n,
      },
    ];
    const fees = 100n;

    result.current.mutate({
      client: mockClient,
      batcherAddress: "0xbatcher" as Address,
      tokenAddress: "0xtoken" as Address,
      fromAddress: "0xfrom" as Address,
      batchTransferData,
      fees,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeConfidentialBatchTransferContract).toHaveBeenCalledWith(
      mockClient,
      "0xbatcher",
      "0xtoken",
      "0xfrom",
      batchTransferData,
      fees,
    );
    expect(result.current.data).toBe("0xbatchhash");
  });
});

describe("useUnwrap", () => {
  it("calls writeUnwrapContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUnwrap(), { wrapper });

    const encryptedAmount = new Uint8Array([10, 20]);
    const inputProof = new Uint8Array([30, 40]);

    result.current.mutate({
      client: mockClient,
      encryptedErc20: "0xencrypted" as Address,
      from: "0xfrom" as Address,
      to: "0xto" as Address,
      encryptedAmount,
      inputProof,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeUnwrapContract).toHaveBeenCalledWith(
      mockClient,
      "0xencrypted",
      "0xfrom",
      "0xto",
      encryptedAmount,
      inputProof,
    );
    expect(result.current.data).toBe("0xunwraphash");
  });
});

describe("useUnwrapFromBalance", () => {
  it("calls writeUnwrapFromBalanceContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useUnwrapFromBalance(), { wrapper });

    const encryptedBalance = "0xbalance" as Address;

    result.current.mutate({
      client: mockClient,
      encryptedErc20: "0xencrypted" as Address,
      from: "0xfrom" as Address,
      to: "0xto" as Address,
      encryptedBalance,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeUnwrapFromBalanceContract).toHaveBeenCalledWith(
      mockClient,
      "0xencrypted",
      "0xfrom",
      "0xto",
      encryptedBalance,
    );
    expect(result.current.data).toBe("0xunwrapbalancehash");
  });
});

describe("useFinalizeUnwrap", () => {
  it("calls writeFinalizeUnwrapContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useFinalizeUnwrap(), { wrapper });

    result.current.mutate({
      client: mockClient,
      wrapper: "0xwrapper" as Address,
      burntAmount: "0xburnt" as Address,
      burntAmountCleartext: 500n,
      decryptionProof: "0xproof" as Address,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeFinalizeUnwrapContract).toHaveBeenCalledWith(
      mockClient,
      "0xwrapper",
      "0xburnt",
      500n,
      "0xproof",
    );
    expect(result.current.data).toBe("0xfinalizehash");
  });
});

describe("useSetOperator", () => {
  it("calls writeSetOperatorContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSetOperator(), { wrapper });

    result.current.mutate({
      client: mockClient,
      tokenAddress: "0xtoken" as Address,
      spender: "0xspender" as Address,
      timestamp: 1234567890,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeSetOperatorContract).toHaveBeenCalledWith(
      mockClient,
      "0xtoken",
      "0xspender",
      1234567890,
    );
    expect(result.current.data).toBe("0xoperatorhash");
  });

  it("passes undefined timestamp when not provided", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useSetOperator(), { wrapper });

    result.current.mutate({
      client: mockClient,
      tokenAddress: "0xtoken" as Address,
      spender: "0xspender" as Address,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeSetOperatorContract).toHaveBeenCalledWith(
      mockClient,
      "0xtoken",
      "0xspender",
      undefined,
    );
  });
});

describe("useWrapETH", () => {
  it("calls writeWrapETHContract with correct params", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(() => useWrapETH(), { wrapper });

    result.current.mutate({
      client: mockClient,
      wrapperAddress: "0xwrapper" as Address,
      to: "0xto" as Address,
      amount: 1000n,
      value: 1000n,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(writeWrapETHContract).toHaveBeenCalledWith(
      mockClient,
      "0xwrapper",
      "0xto",
      1000n,
      1000n,
    );
    expect(result.current.data).toBe("0xwrapethhash");
  });
});

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

describe("useUnderlyingToken", () => {
  it("fetches underlying token address when enabled", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useUnderlyingToken({
          client: mockClient,
          wrapperAddress: "0xwrapper" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readUnderlyingTokenContract).toHaveBeenCalledWith(mockClient, "0xwrapper");
    expect(result.current.data).toBe("0xunderlying");
  });

  it("is disabled when wrapperAddress is undefined", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useUnderlyingToken({
          client: mockClient,
          wrapperAddress: undefined,
        }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(readUnderlyingTokenContract).not.toHaveBeenCalled();
  });
});

describe("useUnderlyingTokenSuspense", () => {
  it("fetches underlying token address via suspense", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useUnderlyingTokenSuspense({
          client: mockClient,
          wrapperAddress: "0xwrapper" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readUnderlyingTokenContract).toHaveBeenCalledWith(mockClient, "0xwrapper");
    expect(result.current.data).toBe("0xunderlying");
  });
});

describe("useWrapperExists", () => {
  it("fetches wrapper existence when enabled", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useWrapperExists({
          client: mockClient,
          coordinator: "0xcoord" as Address,
          tokenAddress: "0xtoken" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readWrapperExistsContract).toHaveBeenCalledWith(mockClient, "0xcoord", "0xtoken");
    expect(result.current.data).toBe(true);
  });

  it("is disabled when coordinator is undefined", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useWrapperExists({
          client: mockClient,
          coordinator: undefined,
          tokenAddress: "0xtoken" as Address,
        }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(readWrapperExistsContract).not.toHaveBeenCalled();
  });

  it("is disabled when tokenAddress is undefined", () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useWrapperExists({
          client: mockClient,
          coordinator: "0xcoord" as Address,
          tokenAddress: undefined,
        }),
      { wrapper },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(readWrapperExistsContract).not.toHaveBeenCalled();
  });
});

describe("useWrapperExistsSuspense", () => {
  it("fetches wrapper existence via suspense", async () => {
    const wrapper = createWrapper();
    const { result } = renderHook(
      () =>
        useWrapperExistsSuspense({
          client: mockClient,
          coordinator: "0xcoord" as Address,
          tokenAddress: "0xtoken" as Address,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(readWrapperExistsContract).toHaveBeenCalledWith(mockClient, "0xcoord", "0xtoken");
    expect(result.current.data).toBe(true);
  });
});
