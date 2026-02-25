import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address, Hex } from "@zama-fhe/sdk";

// ---------------------------------------------------------------------------
// Mock wagmi/actions – WagmiSigner delegates every method to these
// ---------------------------------------------------------------------------
const mockGetChainId = vi.fn();
const mockGetConnection = vi.fn();
const mockSignTypedData = vi.fn();
const mockWriteContract = vi.fn();
const mockReadContract = vi.fn();
const mockWaitForTransactionReceipt = vi.fn();

vi.mock("wagmi/actions", () => ({
  getChainId: (...args: unknown[]) => mockGetChainId(...args),
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
  signTypedData: (...args: unknown[]) => mockSignTypedData(...args),
  writeContract: (...args: unknown[]) => mockWriteContract(...args),
  readContract: (...args: unknown[]) => mockReadContract(...args),
  waitForTransactionReceipt: (...args: unknown[]) => mockWaitForTransactionReceipt(...args),
}));

// ---------------------------------------------------------------------------
// Mock wagmi hooks – used by all wagmi adapter hooks
// ---------------------------------------------------------------------------
const mockMutate = vi.fn();
const mockMutateAsync = vi.fn();
const mockUseWriteContract = vi.fn(() => ({
  mutate: mockMutate,
  mutateAsync: mockMutateAsync,
  isPending: false,
  isIdle: true,
  isSuccess: false,
  isError: false,
  data: undefined,
  error: null,
}));

const mockUseReadContract = vi.fn(() => ({
  data: undefined,
  isLoading: false,
  isSuccess: false,
  isError: false,
  error: null,
}));

vi.mock("wagmi", () => ({
  useWriteContract: (...args: unknown[]) => mockUseWriteContract(...(args as [])),
  useReadContract: (...args: unknown[]) => mockUseReadContract(...(args as [])),
}));

// ---------------------------------------------------------------------------
// Mock contract builders – verify hooks call the correct builder with args
// ---------------------------------------------------------------------------
vi.mock("@zama-fhe/sdk", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    wrapContract: vi.fn(actual.wrapContract as (...args: unknown[]) => unknown),
    wrapETHContract: vi.fn(actual.wrapETHContract as (...args: unknown[]) => unknown),
    unwrapContract: vi.fn(actual.unwrapContract as (...args: unknown[]) => unknown),
    unwrapFromBalanceContract: vi.fn(
      actual.unwrapFromBalanceContract as (...args: unknown[]) => unknown,
    ),
    finalizeUnwrapContract: vi.fn(actual.finalizeUnwrapContract as (...args: unknown[]) => unknown),
    setOperatorContract: vi.fn(actual.setOperatorContract as (...args: unknown[]) => unknown),
    confidentialTransferContract: vi.fn(
      actual.confidentialTransferContract as (...args: unknown[]) => unknown,
    ),
    confidentialBatchTransferContract: vi.fn(
      actual.confidentialBatchTransferContract as (...args: unknown[]) => unknown,
    ),
    confidentialBalanceOfContract: vi.fn(
      actual.confidentialBalanceOfContract as (...args: unknown[]) => unknown,
    ),
    getWrapperContract: vi.fn(actual.getWrapperContract as (...args: unknown[]) => unknown),
    wrapperExistsContract: vi.fn(actual.wrapperExistsContract as (...args: unknown[]) => unknown),
    underlyingContract: vi.fn(actual.underlyingContract as (...args: unknown[]) => unknown),
    supportsInterfaceContract: vi.fn(
      actual.supportsInterfaceContract as (...args: unknown[]) => unknown,
    ),
  };
});

import {
  wrapContract,
  wrapETHContract,
  unwrapContract,
  unwrapFromBalanceContract,
  finalizeUnwrapContract,
  setOperatorContract,
  confidentialTransferContract,
  confidentialBatchTransferContract,
  confidentialBalanceOfContract,
  getWrapperContract,
  wrapperExistsContract,
  underlyingContract,
  supportsInterfaceContract,
} from "@zama-fhe/sdk";

import { WagmiSigner } from "../wagmi/wagmi-signer";
import { useWrap } from "../wagmi/use-wrap";
import { useWrapETH } from "../wagmi/use-wrap-eth";
import { useUnwrap } from "../wagmi/use-unwrap";
import { useUnwrapFromBalance } from "../wagmi/use-unwrap-from-balance";
import { useFinalizeUnwrap } from "../wagmi/use-finalize-unwrap";
import { useSetOperator } from "../wagmi/use-set-operator";
import { useConfidentialTransfer } from "../wagmi/use-confidential-transfer";
import { useConfidentialBatchTransfer } from "../wagmi/use-confidential-batch-transfer";
import { useConfidentialBalanceOf } from "../wagmi/use-confidential-balance-of";
import { useWrapperForToken } from "../wagmi/use-wrapper-for-token";
import { useWrapperExists } from "../wagmi/use-wrapper-exists";
import { useUnderlyingToken } from "../wagmi/use-underlying-token";
import { useSupportsInterface } from "../wagmi/use-supports-interface";

// Minimal wagmi Config stub
const fakeConfig = { _isConfig: true } as never;

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================= WagmiSigner ==================================
describe("WagmiSigner", () => {
  let signer: WagmiSigner;

  beforeEach(() => {
    signer = new WagmiSigner({ config: fakeConfig });
  });

  it("getChainId delegates to wagmi getChainId", async () => {
    mockGetChainId.mockReturnValue(1);

    const chainId = await signer.getChainId();

    expect(chainId).toBe(1);
    expect(mockGetChainId).toHaveBeenCalledWith(fakeConfig);
  });

  it("getAddress returns the connected account address", async () => {
    mockGetConnection.mockReturnValue({ address: "0xabc" });

    const address = await signer.getAddress();

    expect(address).toBe("0xabc");
    expect(mockGetConnection).toHaveBeenCalledWith(fakeConfig);
  });

  it("getAddress throws when no connection exists", async () => {
    mockGetConnection.mockReturnValue(undefined);

    await expect(signer.getAddress()).rejects.toThrow("Invalid address");
  });

  it("getAddress throws when connection has no address", async () => {
    mockGetConnection.mockReturnValue({ address: undefined });

    await expect(signer.getAddress()).rejects.toThrow("Invalid address");
  });

  it("signTypedData delegates to wagmi signTypedData", async () => {
    const typedData = {
      domain: { name: "Test", version: "1", chainId: 1, verifyingContract: "0xabc" as Address },
      types: { Permit: [{ name: "owner", type: "address" }] },
      message: {
        publicKey: "0xkey",
        contractAddresses: ["0x1"],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    };
    mockSignTypedData.mockResolvedValue("0xsig");

    const result = await signer.signTypedData(typedData);

    expect(result).toBe("0xsig");
    expect(mockSignTypedData).toHaveBeenCalledWith(fakeConfig, {
      primaryType: "Permit",
      ...typedData,
    });
  });

  it("writeContract delegates to wagmi writeContract", async () => {
    const contractConfig = {
      address: "0x1" as Address,
      abi: [] as readonly unknown[],
      functionName: "test",
      args: [] as readonly unknown[],
    };
    mockWriteContract.mockResolvedValue("0xtxhash");

    const result = await signer.writeContract(contractConfig);

    expect(result).toBe("0xtxhash");
    expect(mockWriteContract).toHaveBeenCalledWith(fakeConfig, contractConfig);
  });

  it("readContract delegates to wagmi readContract", async () => {
    const contractConfig = {
      address: "0x1" as Address,
      abi: [] as readonly unknown[],
      functionName: "balanceOf",
      args: [] as readonly unknown[],
    };
    mockReadContract.mockResolvedValue(42n);

    const result = await signer.readContract(contractConfig);

    expect(result).toBe(42n);
    expect(mockReadContract).toHaveBeenCalledWith(fakeConfig, contractConfig);
  });

  it("waitForTransactionReceipt delegates to wagmi waitForTransactionReceipt", async () => {
    const receipt = { status: "success", transactionHash: "0xtx" };
    mockWaitForTransactionReceipt.mockResolvedValue(receipt);

    const result = await signer.waitForTransactionReceipt("0xtx" as Hex);

    expect(result).toEqual(receipt);
    expect(mockWaitForTransactionReceipt).toHaveBeenCalledWith(fakeConfig, { hash: "0xtx" });
  });
});

// ======================== Mutation Hooks ====================================
describe("Wagmi mutation hooks", () => {
  describe("useWrap", () => {
    it("calls wrapContract and passes result to mutate", () => {
      const hook = useWrap();

      hook.mutate(
        "0x4444444444444444444444444444444444444444" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        100n,
      );

      expect(vi.mocked(wrapContract)).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        100n,
      );
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "wrap",
          address: "0x4444444444444444444444444444444444444444",
        }),
      );
    });

    it("calls wrapContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useWrap();

      await hook.mutateAsync(
        "0x4444444444444444444444444444444444444444" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        200n,
      );

      expect(vi.mocked(wrapContract)).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        200n,
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrap" }),
      );
    });

    it("exposes mutation state from useWriteContract", () => {
      const hook = useWrap();

      expect(hook.isPending).toBe(false);
      expect(hook.isIdle).toBe(true);
    });
  });

  describe("useWrapETH", () => {
    it("calls wrapETHContract with value and passes result to mutate", () => {
      const hook = useWrapETH();

      hook.mutate(
        "0x4444444444444444444444444444444444444444" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        100n,
        100n,
      );

      expect(vi.mocked(wrapETHContract)).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        100n,
        100n,
      );
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrapETH", value: 100n }),
      );
    });

    it("calls wrapETHContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useWrapETH();

      await hook.mutateAsync(
        "0x4444444444444444444444444444444444444444" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        50n,
        50n,
      );

      expect(vi.mocked(wrapETHContract)).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        50n,
        50n,
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "wrapETH" }),
      );
    });
  });

  describe("useUnwrap", () => {
    it("calls unwrapContract with all parameters and passes result to mutate", () => {
      const handle = new Uint8Array([1, 2, 3]);
      const proof = new Uint8Array([4, 5, 6]);
      const hook = useUnwrap();

      hook.mutate(
        "0x1111111111111111111111111111111111111111" as Address,
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        handle,
        proof,
      );

      expect(vi.mocked(unwrapContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0xcccccccccccccccccccccccccccccccccccccccc",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        handle,
        proof,
      );
      expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ functionName: "unwrap" }));
    });

    it("calls unwrapContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useUnwrap();

      const handle2 = new Uint8Array([7, 8, 9]);
      const proof2 = new Uint8Array([10, 11, 12]);
      await hook.mutateAsync(
        "0x1111111111111111111111111111111111111111" as Address,
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        handle2,
        proof2,
      );

      expect(vi.mocked(unwrapContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0xcccccccccccccccccccccccccccccccccccccccc",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        handle2,
        proof2,
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "unwrap" }),
      );
    });
  });

  describe("useUnwrapFromBalance", () => {
    it("calls unwrapFromBalanceContract and passes result to mutate", () => {
      const hook = useUnwrapFromBalance();

      hook.mutate(
        "0x1111111111111111111111111111111111111111" as Address,
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        100n as unknown as Address,
      );

      expect(vi.mocked(unwrapFromBalanceContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0xcccccccccccccccccccccccccccccccccccccccc",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        100n,
      );
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unwrap",
          address: "0x1111111111111111111111111111111111111111",
        }),
      );
    });

    it("calls unwrapFromBalanceContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useUnwrapFromBalance();

      await hook.mutateAsync(
        "0x1111111111111111111111111111111111111111" as Address,
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        200n as unknown as Address,
      );

      expect(vi.mocked(unwrapFromBalanceContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0xcccccccccccccccccccccccccccccccccccccccc",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        200n,
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "unwrap",
          address: "0x1111111111111111111111111111111111111111",
        }),
      );
    });
  });

  describe("useFinalizeUnwrap", () => {
    it("calls finalizeUnwrapContract and passes result to mutate", () => {
      const hook = useFinalizeUnwrap();

      hook.mutate(
        "0x4444444444444444444444444444444444444444" as Address,
        "0xburnt" as Address,
        500n,
        "0xproof" as Address,
      );

      expect(vi.mocked(finalizeUnwrapContract)).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
        "0xburnt",
        500n,
        "0xproof",
      );
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
    });

    it("calls finalizeUnwrapContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useFinalizeUnwrap();

      await hook.mutateAsync(
        "0x4444444444444444444444444444444444444444" as Address,
        "0xburnt" as Address,
        1000n,
        "0xproof" as Address,
      );

      expect(vi.mocked(finalizeUnwrapContract)).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
        "0xburnt",
        1000n,
        "0xproof",
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "finalizeUnwrap" }),
      );
    });
  });

  describe("useSetOperator", () => {
    it("calls setOperatorContract with default timestamp and passes result to mutate", () => {
      const hook = useSetOperator();

      hook.mutate(
        "0x1111111111111111111111111111111111111111" as Address,
        "0x3333333333333333333333333333333333333333" as Address,
      );

      expect(vi.mocked(setOperatorContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0x3333333333333333333333333333333333333333",
        undefined,
      );
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "setOperator" }),
      );
    });

    it("calls setOperatorContract with custom timestamp", () => {
      const hook = useSetOperator();

      hook.mutate(
        "0x1111111111111111111111111111111111111111" as Address,
        "0x3333333333333333333333333333333333333333" as Address,
        99999,
      );

      expect(vi.mocked(setOperatorContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0x3333333333333333333333333333333333333333",
        99999,
      );
    });

    it("calls setOperatorContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useSetOperator();

      await hook.mutateAsync(
        "0x1111111111111111111111111111111111111111" as Address,
        "0x3333333333333333333333333333333333333333" as Address,
        42,
      );

      expect(vi.mocked(setOperatorContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0x3333333333333333333333333333333333333333",
        42,
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "setOperator" }),
      );
    });
  });

  describe("useConfidentialTransfer", () => {
    it("calls confidentialTransferContract and passes result to mutate", () => {
      const handle = new Uint8Array([10, 20]);
      const proof = new Uint8Array([30, 40]);
      const hook = useConfidentialTransfer();

      hook.mutate(
        "0x1111111111111111111111111111111111111111" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        handle,
        proof,
      );

      expect(vi.mocked(confidentialTransferContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        handle,
        proof,
      );
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "confidentialTransfer" }),
      );
    });

    it("calls confidentialTransferContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useConfidentialTransfer();

      const handle2 = new Uint8Array([50, 60]);
      const proof2 = new Uint8Array([70, 80]);
      await hook.mutateAsync(
        "0x1111111111111111111111111111111111111111" as Address,
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address,
        handle2,
        proof2,
      );

      expect(vi.mocked(confidentialTransferContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        handle2,
        proof2,
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "confidentialTransfer" }),
      );
    });
  });

  describe("useConfidentialBatchTransfer", () => {
    it("calls confidentialBatchTransferContract and passes result to mutate", () => {
      const batchData = [
        {
          to: "0x8888888888888888888888888888888888888888" as Address,
          encryptedAmount: "0xenc" as Address,
          inputProof: "0xproof" as Address,
          retryFor: 0n,
        },
      ];
      const hook = useConfidentialBatchTransfer();

      hook.mutate(
        "0x7777777777777777777777777777777777777777" as Address,
        "0x1111111111111111111111111111111111111111" as Address,
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        batchData,
        100n,
      );

      expect(vi.mocked(confidentialBatchTransferContract)).toHaveBeenCalledWith(
        "0x7777777777777777777777777777777777777777",
        "0x1111111111111111111111111111111111111111",
        "0xcccccccccccccccccccccccccccccccccccccccc",
        batchData,
        100n,
      );
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialBatchTransfer",
          value: 100n,
        }),
      );
    });

    it("calls confidentialBatchTransferContract and passes result to mutateAsync", async () => {
      mockMutateAsync.mockResolvedValue("0xtxhash");
      const hook = useConfidentialBatchTransfer();

      await hook.mutateAsync(
        "0x7777777777777777777777777777777777777777" as Address,
        "0x1111111111111111111111111111111111111111" as Address,
        "0xcccccccccccccccccccccccccccccccccccccccc" as Address,
        [],
        0n,
      );

      expect(vi.mocked(confidentialBatchTransferContract)).toHaveBeenCalledWith(
        "0x7777777777777777777777777777777777777777",
        "0x1111111111111111111111111111111111111111",
        "0xcccccccccccccccccccccccccccccccccccccccc",
        [],
        0n,
      );
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ functionName: "confidentialBatchTransfer" }),
      );
    });
  });
});

// ========================= Query Hooks ======================================
describe("Wagmi query hooks", () => {
  describe("useConfidentialBalanceOf", () => {
    it("calls confidentialBalanceOfContract and useReadContract with enabled=true", () => {
      useConfidentialBalanceOf({
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
        userAddress: "0x2222222222222222222222222222222222222222" as Address,
      });

      expect(vi.mocked(confidentialBalanceOfContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0x2222222222222222222222222222222222222222",
      );
      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          functionName: "confidentialBalanceOf",
          address: "0x1111111111111111111111111111111111111111",
          query: { enabled: true },
        }),
      );
    });

    it("passes enabled=false when tokenAddress is undefined", () => {
      useConfidentialBalanceOf({
        tokenAddress: undefined,
        userAddress: "0x2222222222222222222222222222222222222222" as Address,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });

    it("passes enabled=false when userAddress is undefined", () => {
      useConfidentialBalanceOf({
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
        userAddress: undefined,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });

    it("passes enabled=false when both addresses are undefined", () => {
      useConfidentialBalanceOf({
        tokenAddress: undefined,
        userAddress: undefined,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });
  });

  describe("useWrapperForToken", () => {
    it("calls getWrapperContract and useReadContract with enabled=true", () => {
      useWrapperForToken({
        coordinator: "0x5555555555555555555555555555555555555555" as Address,
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
      });

      expect(vi.mocked(getWrapperContract)).toHaveBeenCalledWith(
        "0x5555555555555555555555555555555555555555",
        "0x1111111111111111111111111111111111111111",
      );
      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x5555555555555555555555555555555555555555",
          query: { enabled: true },
        }),
      );
    });

    it("passes enabled=false when coordinator is undefined", () => {
      useWrapperForToken({
        coordinator: undefined,
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });

    it("passes enabled=false when tokenAddress is undefined", () => {
      useWrapperForToken({
        coordinator: "0x5555555555555555555555555555555555555555" as Address,
        tokenAddress: undefined,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });
  });

  describe("useWrapperExists", () => {
    it("calls wrapperExistsContract and useReadContract with enabled=true", () => {
      useWrapperExists({
        coordinator: "0x5555555555555555555555555555555555555555" as Address,
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
      });

      expect(vi.mocked(wrapperExistsContract)).toHaveBeenCalledWith(
        "0x5555555555555555555555555555555555555555",
        "0x1111111111111111111111111111111111111111",
      );
      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x5555555555555555555555555555555555555555",
          query: { enabled: true },
        }),
      );
    });

    it("passes enabled=false when coordinator is undefined", () => {
      useWrapperExists({
        coordinator: undefined,
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });

    it("passes enabled=false when tokenAddress is undefined", () => {
      useWrapperExists({
        coordinator: "0x5555555555555555555555555555555555555555" as Address,
        tokenAddress: undefined,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });
  });

  describe("useUnderlyingToken", () => {
    it("calls underlyingContract and useReadContract with enabled=true", () => {
      useUnderlyingToken({
        wrapperAddress: "0x4444444444444444444444444444444444444444" as Address,
      });

      expect(vi.mocked(underlyingContract)).toHaveBeenCalledWith(
        "0x4444444444444444444444444444444444444444",
      );
      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x4444444444444444444444444444444444444444",
          functionName: "underlying",
          query: { enabled: true },
        }),
      );
    });

    it("passes enabled=false when wrapperAddress is undefined", () => {
      useUnderlyingToken({
        wrapperAddress: undefined,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });
  });

  describe("useSupportsInterface", () => {
    it("calls supportsInterfaceContract and useReadContract with enabled=true", () => {
      useSupportsInterface({
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
        interfaceId: "0x12345678" as Address,
      });

      expect(vi.mocked(supportsInterfaceContract)).toHaveBeenCalledWith(
        "0x1111111111111111111111111111111111111111",
        "0x12345678",
      );
      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0x1111111111111111111111111111111111111111",
          query: { enabled: true },
        }),
      );
    });

    it("passes enabled=false when tokenAddress is undefined", () => {
      useSupportsInterface({
        tokenAddress: undefined,
        interfaceId: "0x12345678" as Address,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });

    it("passes enabled=false when interfaceId is undefined", () => {
      useSupportsInterface({
        tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
        interfaceId: undefined,
      });

      expect(mockUseReadContract).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { enabled: false },
        }),
      );
    });
  });
});

// ====================== Suspense Variants ===================================
describe("Wagmi suspense query hooks", () => {
  it("useConfidentialBalanceOfSuspense passes suspense: true", async () => {
    const { useConfidentialBalanceOfSuspense } =
      await import("../wagmi/use-confidential-balance-of");

    useConfidentialBalanceOfSuspense({
      tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
      userAddress: "0x2222222222222222222222222222222222222222" as Address,
    });

    expect(vi.mocked(confidentialBalanceOfContract)).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
    );
    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { suspense: true },
      }),
    );
  });

  it("useWrapperForTokenSuspense passes suspense: true", async () => {
    const { useWrapperForTokenSuspense } = await import("../wagmi/use-wrapper-for-token");

    useWrapperForTokenSuspense({
      coordinator: "0x5555555555555555555555555555555555555555" as Address,
      tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
    });

    expect(vi.mocked(getWrapperContract)).toHaveBeenCalledWith(
      "0x5555555555555555555555555555555555555555",
      "0x1111111111111111111111111111111111111111",
    );
    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { suspense: true },
      }),
    );
  });

  it("useWrapperExistsSuspense passes suspense: true", async () => {
    const { useWrapperExistsSuspense } = await import("../wagmi/use-wrapper-exists");

    useWrapperExistsSuspense({
      coordinator: "0x5555555555555555555555555555555555555555" as Address,
      tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
    });

    expect(vi.mocked(wrapperExistsContract)).toHaveBeenCalledWith(
      "0x5555555555555555555555555555555555555555",
      "0x1111111111111111111111111111111111111111",
    );
    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { suspense: true },
      }),
    );
  });

  it("useUnderlyingTokenSuspense passes suspense: true", async () => {
    const { useUnderlyingTokenSuspense } = await import("../wagmi/use-underlying-token");

    useUnderlyingTokenSuspense({
      wrapperAddress: "0x4444444444444444444444444444444444444444" as Address,
    });

    expect(vi.mocked(underlyingContract)).toHaveBeenCalledWith(
      "0x4444444444444444444444444444444444444444",
    );
    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { suspense: true },
      }),
    );
  });

  it("useSupportsInterfaceSuspense passes suspense: true", async () => {
    const { useSupportsInterfaceSuspense } = await import("../wagmi/use-supports-interface");

    useSupportsInterfaceSuspense({
      tokenAddress: "0x1111111111111111111111111111111111111111" as Address,
      interfaceId: "0x12345678" as Address,
    });

    expect(vi.mocked(supportsInterfaceContract)).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111",
      "0x12345678",
    );
    expect(mockUseReadContract).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { suspense: true },
      }),
    );
  });
});
