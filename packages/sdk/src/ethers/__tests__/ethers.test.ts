import type { Address, Hex } from "viem";
import { decodeFunctionResult, encodeAbiParameters, encodeFunctionResult } from "viem";
import { Wallet } from "ethers";
import type * as ethersModule from "ethers";
import { vi } from "vitest";
import { test, describe, expect } from "../../test-fixtures";
import { WalletNotConnectedError } from "../../errors";
import type { EIP712TypedData } from "../../relayer/types";

// ── Mock ethers ──────────────────────────────────────────────

const { mockContractMethod, MockContract, MockBrowserProvider, mockGetSigner } = vi.hoisted(() => {
  const mockContractMethod = vi.fn();

  // Must be a real function (not arrow) so it can be used with `new`
  function MockContract() {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return undefined;
          }
          if (prop === "getFunction") {
            return () => mockContractMethod;
          }
          return mockContractMethod;
        },
      },
    );
  }

  const mockGetSigner = vi.fn();

  class MockBrowserProvider {
    // eslint-disable-next-line no-useless-constructor -- mock accepts provider arg to match BrowserProvider signature
    constructor(_provider: unknown) {}
    getSigner() {
      return mockGetSigner();
    }
  }

  return { mockContractMethod, MockContract, MockBrowserProvider, mockGetSigner };
});

vi.mock("ethers", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof ethersModule;
  return {
    ...actual,
    ethers: { ...actual.ethers, Contract: MockContract },
    Contract: MockContract,
    BrowserProvider: MockBrowserProvider,
  };
});

// ── Imports (after mock) ─────────────────────────────────────

import { EthersSigner } from "../ethers-signer";
import { EthersProvider } from "../ethers-provider";
import {
  readConfidentialBalanceOfContract,
  readUnderlyingTokenContract,
  readSupportsInterfaceContract,
  writeConfidentialTransferContract,
  writeUnwrapContract,
  writeUnwrapFromBalanceContract,
  writeFinalizeUnwrapContract,
  writeSetOperatorContract,
  writeWrapContract,
} from "../contracts";

// ── Test constants ───────────────────────────────────────────

const SPENDER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;
const TX_HASH = "0xdeadbeef" as Hex;
const MOCK_ADDRESS = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const NEXT_ADDRESS = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const PRIVATE_KEY = `0x${"11".repeat(32)}` as const;
const WALLET_ADDRESS = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const CHAIN_ID = 8009;
const VERIFYING_CONTRACT = "0x0000000000000000000000000000000000000001";
const VALID_ENCRYPTED_VALUE = ("0x" + "ab".repeat(32)) as Hex;
const VALID_PROOF = ("0x" + "cd".repeat(32)) as Hex;

// ── EthersSigner ─────────────────────────────────────────────

describe("EthersSigner", () => {
  describe("constructor", () => {
    test("accepts an EIP-1193 provider without resolving a signer", async () => {
      const mockEthereum = {
        on: vi.fn(),
        removeListener: vi.fn(),
        request: vi.fn().mockRejectedValue(new Error("not connected")),
      };
      const ethersSigner = new EthersSigner({ ethereum: mockEthereum as never });

      expect(ethersSigner.walletAccount.getSnapshot()).toBeUndefined();
      expect(mockGetSigner).not.toHaveBeenCalled();
    });

    test("subscribe works with { ethereum } config", () => {
      const mockEthereum = {
        on: vi.fn(),
        removeListener: vi.fn(),
        request: vi.fn().mockRejectedValue(new Error("not connected")),
      };

      const ethersSigner = new EthersSigner({ ethereum: mockEthereum as never });

      const onWalletAccountChange = vi.fn();
      const unsub = ethersSigner.walletAccount.subscribe(onWalletAccountChange);

      expect(mockEthereum.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function));
      expect(mockEthereum.on).toHaveBeenCalledWith("disconnect", expect.any(Function));
      expect(mockEthereum.on).toHaveBeenCalledWith("chainChanged", expect.any(Function));
      expect(typeof unsub).toBe("function");

      unsub();
      expect(mockEthereum.removeListener).not.toHaveBeenCalled();
    });

    test("dispose removes EIP-1193 listeners", () => {
      const mockEthereum = {
        on: vi.fn(),
        removeListener: vi.fn(),
        request: vi.fn().mockRejectedValue(new Error("not connected")),
      };

      const ethersSigner = new EthersSigner({ ethereum: mockEthereum as never });

      ethersSigner.dispose();
      ethersSigner.dispose();

      expect(mockEthereum.removeListener).toHaveBeenCalledTimes(3);
      expect(mockEthereum.removeListener).toHaveBeenCalledWith(
        "accountsChanged",
        expect.any(Function),
      );
      expect(mockEthereum.removeListener).toHaveBeenCalledWith("disconnect", expect.any(Function));
      expect(mockEthereum.removeListener).toHaveBeenCalledWith(
        "chainChanged",
        expect.any(Function),
      );
    });

    test("subscribe loads initial wallet account for browser signers", async () => {
      const mockEthereum = {
        on: vi.fn(),
        removeListener: vi.fn(),
        request: vi.fn((request: { method: string }) => {
          if (request.method === "eth_accounts") {
            return Promise.resolve([MOCK_ADDRESS]);
          }
          if (request.method === "eth_chainId") {
            return Promise.resolve("0x1f49");
          }
          return Promise.reject(new Error("unhandled"));
        }),
      };

      const ethersSigner = new EthersSigner({ ethereum: mockEthereum as never });

      const onWalletAccountChange = vi.fn();
      ethersSigner.walletAccount.subscribe(onWalletAccountChange);
      await vi.waitFor(() => {
        expect(onWalletAccountChange).toHaveBeenCalledWith({
          previous: undefined,
          next: { address: MOCK_ADDRESS, chainId: 8009 },
        });
      });
      const accountsChanged = mockEthereum.on.mock.calls.find(
        ([event]) => event === "accountsChanged",
      )?.[1] as (accounts: Address[]) => void;

      accountsChanged([NEXT_ADDRESS]);

      expect(onWalletAccountChange).toHaveBeenLastCalledWith({
        previous: { address: MOCK_ADDRESS, chainId: 8009 },
        next: { address: NEXT_ADDRESS, chainId: 8009 },
      });
    });

    test("subscribe returns no-op with { signer } config", () => {
      const ethersSigner = new EthersSigner({ signer: {} as never });

      const unsub = ethersSigner.walletAccount.subscribe(vi.fn());
      expect(typeof unsub).toBe("function");
      // Should not throw
      unsub();
    });
  });

  describe("real ethers Wallet", () => {
    test("throws WalletNotConnectedError when a direct signer has no provider", async () => {
      const signer = new EthersSigner({ signer: new Wallet(PRIVATE_KEY) });

      await expect(signer.refreshWalletAccount()).resolves.toBeUndefined();
      expect(() => signer.requireWalletAccount("test")).toThrow(WalletNotConnectedError);
    });

    test("does not hide provider errors during explicit wallet-account resolution", async () => {
      const providerError = new Error("network unavailable");
      const wallet = new Wallet(PRIVATE_KEY, {
        getNetwork: async () => {
          throw providerError;
        },
      } as never);
      const signer = new EthersSigner({ signer: wallet });

      await expect(signer.refreshWalletAccount()).rejects.toBe(providerError);
    });

    test("resolves wallet account and signs typed data through ethers", async () => {
      const wallet = new Wallet(PRIVATE_KEY, {
        getNetwork: async () => ({ chainId: BigInt(CHAIN_ID) }),
        resolveName: async (name: string) => name,
      } as never);
      const signer = new EthersSigner({ signer: wallet });

      await expect(signer.refreshWalletAccount()).resolves.toEqual({
        address: WALLET_ADDRESS,
        chainId: CHAIN_ID,
      });
      expect(signer.requireWalletAccount("test")).toEqual({
        address: WALLET_ADDRESS,
        chainId: CHAIN_ID,
      });

      const typedData: EIP712TypedData = {
        domain: {
          name: "Decryption",
          version: "1",
          chainId: 1n,
          verifyingContract: VERIFYING_CONTRACT,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          UserDecryptRequestVerification: [
            { name: "publicKey", type: "bytes" },
            { name: "contractAddresses", type: "address[]" },
            { name: "startTimestamp", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "extraData", type: "bytes" },
          ],
        },
        primaryType: "UserDecryptRequestVerification",
        message: {
          publicKey: "0x",
          contractAddresses: [MOCK_ADDRESS, NEXT_ADDRESS],
          startTimestamp: "1",
          durationDays: "1",
          extraData: "0x00",
        },
      };

      await expect(signer.signTypedData(typedData)).resolves.toMatch(/^0x[0-9a-fA-F]{130}$/);
    });
  });

  describe("writeContract", () => {
    test("creates an ethers Contract, calls the function, and returns the tx hash", async ({
      tokenAddress,
      userAddress,
    }) => {
      const ethersSigner = new EthersSigner({ signer: {} as never });

      mockContractMethod.mockResolvedValueOnce({ hash: TX_HASH });

      const config = {
        address: tokenAddress,
        abi: [{ name: "transfer" }],
        functionName: "transfer",
        args: [userAddress, 100n] as const,
      };

      const hash = await ethersSigner.writeContract(config);
      expect(mockContractMethod).toHaveBeenCalledWith(userAddress, 100n, {});
      expect(hash).toBe(TX_HASH);
    });

    test("passes value in overrides when provided", async ({ tokenAddress, userAddress }) => {
      const ethersSigner = new EthersSigner({ signer: {} as never });

      mockContractMethod.mockResolvedValueOnce({ hash: TX_HASH });

      const config = {
        address: tokenAddress,
        abi: [{ name: "wrapETH" }],
        functionName: "wrapETH",
        args: [userAddress, 500n] as const,
        value: 500n,
      };

      await ethersSigner.writeContract(config);
      expect(mockContractMethod).toHaveBeenCalledWith(userAddress, 500n, { value: 500n });
    });

    test("throws when tx hash does not start with 0x", async ({ tokenAddress }) => {
      const ethersSigner = new EthersSigner({ signer: {} as never });

      mockContractMethod.mockResolvedValueOnce({ hash: "notHex" });

      const config = { address: tokenAddress, abi: [], functionName: "fn", args: [] };

      await expect(ethersSigner.writeContract(config)).rejects.toThrow("Expected hex string");
    });
  });
});

// ── EthersProvider ────────────────────────────────────────────

describe("EthersProvider", () => {
  describe("constructor", () => {
    test("accepts an EIP-1193 provider and creates BrowserProvider internally", async () => {
      const mockEthereum = {
        on: vi.fn(),
        removeListener: vi.fn(),
        request: vi.fn().mockRejectedValue(new Error("not connected")),
      };
      // Does not throw
      const provider = new EthersProvider({ ethereum: mockEthereum as never });
      expect(provider).toBeInstanceOf(EthersProvider);
    });

    test("accepts a pre-built Provider directly", () => {
      const mockProvider = { getNetwork: vi.fn() };
      const provider = new EthersProvider({ provider: mockProvider as never });
      expect(provider).toBeInstanceOf(EthersProvider);
    });
  });

  describe("getChainId", () => {
    test("returns the numeric chain ID from the provider network", async () => {
      const mockProvider = { getNetwork: vi.fn().mockResolvedValue({ chainId: 8009n }) };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      const chainId = await ethersProvider.getChainId();
      expect(mockProvider.getNetwork).toHaveBeenCalled();
      expect(chainId).toBe(8009);
    });
  });

  describe("readContract", () => {
    const providerReturning = (data: Hex) =>
      new EthersProvider({ provider: { call: vi.fn().mockResolvedValue(data) } as never });

    // Builds a single `read()` view function whose outputs are the given ABI params, keeping the
    // const type precise so viem can infer the encode/decode result shape.
    const abiWith = <const TOutputs extends readonly unknown[]>(outputs: TOutputs) =>
      [{ type: "function", name: "read", stateMutability: "view", inputs: [], outputs }] as const;

    test("returns a wide integer (uint256) as a bigint, like viem", async ({ tokenAddress }) => {
      const abi = abiWith([{ type: "uint256" }]);
      const data = encodeFunctionResult({ abi, functionName: "read", result: 42n });
      const result = await providerReturning(data).readContract({
        address: tokenAddress,
        abi,
        functionName: "read",
        args: [],
      });

      expect(result).toBe(42n);
      expect(result).toEqual(decodeFunctionResult({ abi, functionName: "read", data }));
    });

    test("narrows a small integer output (uint8) to a number, like viem", async ({
      tokenAddress,
    }) => {
      const abi = abiWith([{ type: "uint8" }]);
      const data = encodeFunctionResult({ abi, functionName: "read", result: 6 });
      const result = await providerReturning(data).readContract({
        address: tokenAddress,
        abi,
        functionName: "read",
        args: [],
      });

      expect(result).toBe(6);
      expect(typeof result).toBe("number");
    });

    test("narrows small integers nested inside an array output, like viem", async ({
      tokenAddress,
    }) => {
      const abi = abiWith([{ type: "uint8[]" }]);
      const data = encodeFunctionResult({ abi, functionName: "read", result: [6, 18] });
      const result = await providerReturning(data).readContract({
        address: tokenAddress,
        abi,
        functionName: "read",
        args: [],
      });

      expect(result).toEqual([6, 18]);
    });

    test("decodes a named tuple/struct to a keyed object, like viem (not a positional array)", async ({
      tokenAddress,
      userAddress,
    }) => {
      // Mirrors the registry's `TokenWrapperPair` struct, which callers read via `pair.tokenAddress`.
      const abi = abiWith([
        {
          type: "tuple",
          components: [
            { name: "tokenAddress", type: "address" },
            { name: "confidentialTokenAddress", type: "address" },
            { name: "isValid", type: "bool" },
          ],
        },
      ]);
      const pair = {
        tokenAddress: tokenAddress,
        confidentialTokenAddress: userAddress,
        isValid: true,
      };
      const data = encodeFunctionResult({ abi, functionName: "read", result: pair });
      const result = await providerReturning(data).readContract({
        address: tokenAddress,
        abi,
        functionName: "read",
        args: [],
      });

      expect(result).toEqual(pair);
      expect(result).toEqual(decodeFunctionResult({ abi, functionName: "read", data }));
    });

    test("decodes each value of a multi-output call independently, like viem", async ({
      tokenAddress,
    }) => {
      const abi = abiWith([{ type: "uint8" }, { type: "uint256" }]);
      const data = encodeFunctionResult({ abi, functionName: "read", result: [6, 100n] });
      const result = await providerReturning(data).readContract({
        address: tokenAddress,
        abi,
        functionName: "read",
        args: [],
      });

      // uint8 → number, uint256 → bigint.
      expect(result).toEqual([6, 100n]);
    });

    test("returns undefined for a function with no outputs, like viem", async ({
      tokenAddress,
    }) => {
      const abi = abiWith([]);
      const result = await providerReturning("0x").readContract({
        address: tokenAddress,
        abi,
        functionName: "read",
        args: [],
      });

      expect(result).toBeUndefined();
    });
  });

  describe("waitForTransactionReceipt", () => {
    test("waits for the transaction and maps logs correctly", async () => {
      const mockProvider = {
        waitForTransaction: vi
          .fn()
          .mockResolvedValue({
            logs: [{ topics: ["0xtopic1", null, "0xtopic3"], data: "0xdata" }],
          }),
      };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      const receipt = await ethersProvider.waitForTransactionReceipt("0xhash" as Hex);

      expect(mockProvider.waitForTransaction).toHaveBeenCalledWith("0xhash");
      expect(receipt.logs).toEqual([{ topics: ["0xtopic1", "0xtopic3"], data: "0xdata" }]);
    });

    test("filters out null topics from logs", async () => {
      const mockProvider = {
        waitForTransaction: vi
          .fn()
          .mockResolvedValue({ logs: [{ topics: [null, "0xa", null, "0xb"], data: "0x" }] }),
      };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      const receipt = await ethersProvider.waitForTransactionReceipt("0xhash" as Hex);
      expect(receipt.logs[0]!.topics).toEqual(["0xa", "0xb"]);
    });

    test("throws when receipt is null", async () => {
      const mockProvider = { waitForTransaction: vi.fn().mockResolvedValue(null) };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      await expect(ethersProvider.waitForTransactionReceipt("0xhash" as Hex)).rejects.toThrow(
        "no receipt found for tx",
      );
    });

    test("propagates errors from waitForTransaction", async () => {
      const mockProvider = {
        waitForTransaction: vi.fn().mockRejectedValue(new Error("transaction could not be found")),
      };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      await expect(ethersProvider.waitForTransactionReceipt("0xhash" as Hex)).rejects.toThrow(
        "transaction could not be found",
      );
    });
  });

  describe("getBlockTimestamp", () => {
    test("returns the latest block timestamp as bigint", async () => {
      const mockProvider = { getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000 }) };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      const timestamp = await ethersProvider.getBlockTimestamp();
      expect(mockProvider.getBlock).toHaveBeenCalledWith("latest");
      expect(timestamp).toBe(1700000000n);
    });

    test("throws when no block is returned", async () => {
      const mockProvider = { getBlock: vi.fn().mockResolvedValue(null) };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      await expect(ethersProvider.getBlockTimestamp()).rejects.toThrow(
        "failed to fetch latest block",
      );
    });
  });

  describe("sendRawTransaction", () => {
    test("delegates to provider.broadcastTransaction and returns the hash", async () => {
      const mockProvider = {
        broadcastTransaction: vi.fn().mockResolvedValue({ hash: "0xtxhash" }),
      };
      const ethersProvider = new EthersProvider({ provider: mockProvider as never });

      const hash = await ethersProvider.sendRawTransaction("0xdeadbeef" as Hex);

      expect(mockProvider.broadcastTransaction).toHaveBeenCalledWith("0xdeadbeef");
      expect(hash).toBe("0xtxhash");
    });
  });

  describe("prepareTransaction", () => {
    const balanceOfAbi = [
      {
        type: "function",
        name: "balanceOf",
        inputs: [{ name: "owner", type: "address" }],
        outputs: [{ type: "uint256" }],
        stateMutability: "view",
      },
    ] as const;

    function buildProvider(overrides: Record<string, unknown> = {}) {
      return {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }),
        getTransactionCount: vi.fn().mockResolvedValue(7),
        estimateGas: vi.fn().mockResolvedValue(21000n),
        getFeeData: vi.fn().mockResolvedValue({ maxFeePerGas: 100n, maxPriorityFeePerGas: 1n }),
        ...overrides,
      };
    }

    test("reads the nonce with the pending block tag for queue-aware sequencing", async ({
      tokenAddress,
      userAddress,
    }) => {
      const mockProvider = buildProvider();
      const provider = new EthersProvider({ provider: mockProvider as never });

      await provider.prepareTransaction({
        from: userAddress,
        call: {
          address: tokenAddress,
          abi: balanceOfAbi,
          functionName: "balanceOf",
          args: [userAddress],
        },
      });

      expect(mockProvider.getTransactionCount).toHaveBeenCalledWith(userAddress, "pending");
    });

    test("skips getTransactionCount entirely when caller pins the nonce", async ({
      tokenAddress,
      userAddress,
    }) => {
      const mockProvider = buildProvider();
      const provider = new EthersProvider({ provider: mockProvider as never });

      await provider.prepareTransaction({
        from: userAddress,
        call: {
          address: tokenAddress,
          abi: balanceOfAbi,
          functionName: "balanceOf",
          args: [userAddress],
        },
        nonce: 42,
      });

      expect(mockProvider.getTransactionCount).not.toHaveBeenCalled();
    });
  });
});

// ── contracts.ts read helpers ────────────────────────────────

describe("ethers read contract helpers", () => {
  const mockProvider = { call: vi.fn() };

  test("readConfidentialBalanceOfContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockProvider.call).mockResolvedValueOnce(
      encodeAbiParameters([{ type: "bytes32" }], [VALID_ENCRYPTED_VALUE]),
    );
    const result = await readConfidentialBalanceOfContract(mockProvider, tokenAddress, userAddress);
    expect(result).toBe(VALID_ENCRYPTED_VALUE);
  });

  test("readUnderlyingTokenContract", async ({ wrapperAddress }) => {
    vi.mocked(mockProvider.call).mockResolvedValueOnce(
      encodeAbiParameters([{ type: "address" }], [MOCK_ADDRESS]),
    );
    const result = await readUnderlyingTokenContract(mockProvider, wrapperAddress);
    expect(result).toBe(MOCK_ADDRESS);
  });

  test("readSupportsInterfaceContract", async ({ tokenAddress }) => {
    vi.mocked(mockProvider.call).mockResolvedValueOnce(
      encodeAbiParameters([{ type: "bool" }], [true]),
    );
    const interfaceId = "0x12345678" as Address;
    const result = await readSupportsInterfaceContract(mockProvider, tokenAddress, interfaceId);
    expect(result).toBe(true);
  });
});

// ── contracts.ts write helpers ───────────────────────────────

describe("ethers write contract helpers", () => {
  const mockSigner = { call: vi.fn(), sendTransaction: vi.fn() };

  test("writeConfidentialTransferContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeConfidentialTransferContract(
      mockSigner,
      tokenAddress,
      userAddress,
      VALID_ENCRYPTED_VALUE,
      VALID_PROOF,
    );
    expect(hash).toBe(TX_HASH);
  });

  test("writeUnwrapContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeUnwrapContract(
      mockSigner,
      tokenAddress,
      userAddress,
      SPENDER,
      VALID_ENCRYPTED_VALUE,
      VALID_PROOF,
    );
    expect(hash).toBe(TX_HASH);
  });

  test("writeUnwrapFromBalanceContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const balance = VALID_ENCRYPTED_VALUE;
    const hash = await writeUnwrapFromBalanceContract(
      mockSigner,
      tokenAddress,
      userAddress,
      SPENDER,
      balance,
    );
    expect(hash).toBe(TX_HASH);
  });

  test("writeFinalizeUnwrapContract", async ({ wrapperAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const burnt = VALID_ENCRYPTED_VALUE;
    const proof = VALID_PROOF;
    const hash = await writeFinalizeUnwrapContract(mockSigner, wrapperAddress, burnt, 500n, proof);
    expect(hash).toBe(TX_HASH);
  });

  test("writeSetOperatorContract", async ({ tokenAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeSetOperatorContract(mockSigner, tokenAddress, SPENDER, 12345);
    expect(hash).toBe(TX_HASH);
  });

  test("writeSetOperatorContract without explicit timestamp", async ({ tokenAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeSetOperatorContract(mockSigner, tokenAddress, SPENDER);
    expect(hash).toBe(TX_HASH);
  });

  test("writeWrapContract", async ({ wrapperAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeWrapContract(mockSigner, wrapperAddress, userAddress, 1000n);
    expect(hash).toBe(TX_HASH);
  });

  test("write helpers reject when tx hash is not hex", async ({ wrapperAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: "notHex" });
    await expect(writeWrapContract(mockSigner, wrapperAddress, userAddress, 1000n)).rejects.toThrow(
      "Expected hex string",
    );
  });
});
