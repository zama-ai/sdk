import { vi } from "vitest";
import { encodeAbiParameters, Address, Hex } from "viem";
import { test as base, describe, expect } from "../../test-fixtures";
import type { EIP712TypedData } from "../../relayer/relayer-sdk.types";

// ── Mock ethers ──────────────────────────────────────────────

const { mockContractMethod, MockContract, MockBrowserProvider, mockGetSigner } = vi.hoisted(() => {
  const mockContractMethod = vi.fn();

  // Must be a real function (not arrow) so it can be used with `new`
  function MockContract() {
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return undefined;
          return mockContractMethod;
        },
      },
    );
  }

  const mockGetSigner = vi.fn();

  class MockBrowserProvider {
    constructor(_provider: unknown) {}
    getSigner() {
      return mockGetSigner();
    }
  }

  return { mockContractMethod, MockContract, MockBrowserProvider, mockGetSigner };
});

vi.mock("ethers", () => {
  return {
    ethers: { Contract: MockContract },
    Contract: MockContract,
    BrowserProvider: MockBrowserProvider,
  };
});

// ── Imports (after mock) ─────────────────────────────────────

import { EthersSigner } from "../ethers-signer";
import {
  readConfidentialBalanceOfContract,
  readWrapperForTokenContract,
  readUnderlyingTokenContract,
  readWrapperExistsContract,
  readSupportsInterfaceContract,
  writeConfidentialTransferContract,
  writeConfidentialBatchTransferContract,
  writeUnwrapContract,
  writeUnwrapFromBalanceContract,
  writeFinalizeUnwrapContract,
  writeSetOperatorContract,
  writeWrapContract,
  writeWrapETHContract,
} from "../contracts";

// ── Test constants ───────────────────────────────────────────

const SPENDER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;
const COORDINATOR = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address;
const BATCHER = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const TX_HASH = "0xdeadbeef" as Hex;
const MOCK_ADDRESS = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const MOCK_SIGNATURE = ("0x" + "12".repeat(65)) as Hex;
const VALID_HANDLE = ("0x" + "ab".repeat(32)) as Hex;
const VALID_PROOF = ("0x" + "cd".repeat(32)) as Hex;

// ── Ethers-specific fixtures ─────────────────────────────────

interface EthersFixtures {
  createEthersMockSigner: () => {
    getAddress: ReturnType<typeof vi.fn>;
    signTypedData: ReturnType<typeof vi.fn>;
    provider: {
      getNetwork: ReturnType<typeof vi.fn>;
      waitForTransaction: ReturnType<typeof vi.fn>;
    };
  };
}

const eit = base.extend<EthersFixtures>({
  // eslint-disable-next-line no-empty-pattern
  createEthersMockSigner: async ({}, use) => {
    vi.clearAllMocks();
    await use(() => ({
      getAddress: vi.fn().mockResolvedValue(MOCK_ADDRESS),
      signTypedData: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
      provider: {
        getNetwork: vi.fn().mockResolvedValue({ chainId: 8009n }),
        waitForTransaction: vi.fn().mockResolvedValue({
          logs: [{ topics: ["0xtopic1", null, "0xtopic3"], data: "0xdata" }],
        }),
      },
    }));
  },
});

// ── EthersSigner ─────────────────────────────────────────────

describe("EthersSigner", () => {
  describe("constructor", () => {
    eit(
      "accepts an EIP-1193 provider and creates BrowserProvider internally",
      async ({ createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        mockGetSigner.mockResolvedValue(signer);

        const mockEthereum = { on: vi.fn(), removeListener: vi.fn(), request: vi.fn() };
        const ethersSigner = new EthersSigner({ ethereum: mockEthereum as never });

        const address = await ethersSigner.getAddress();
        expect(signer.getAddress).toHaveBeenCalled();
        expect(address).toBe(MOCK_ADDRESS);
      },
    );

    eit("accepts a Signer directly", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const address = await ethersSigner.getAddress();
      expect(signer.getAddress).toHaveBeenCalled();
      expect(address).toBe(MOCK_ADDRESS);
    });

    eit("subscribe works with { ethereum } config", ({ createEthersMockSigner }) => {
      const mockEthereum = { on: vi.fn(), removeListener: vi.fn(), request: vi.fn() };
      const signer = createEthersMockSigner();
      mockGetSigner.mockResolvedValue(signer);

      const ethersSigner = new EthersSigner({ ethereum: mockEthereum as never });

      const onDisconnect = vi.fn();
      const onAccountChange = vi.fn();
      const unsub = ethersSigner.subscribe({ onDisconnect, onAccountChange });

      expect(mockEthereum.on).toHaveBeenCalledWith("accountsChanged", expect.any(Function));
      expect(mockEthereum.on).toHaveBeenCalledWith("disconnect", expect.any(Function));
      expect(typeof unsub).toBe("function");

      unsub();
      expect(mockEthereum.removeListener).toHaveBeenCalledWith(
        "accountsChanged",
        expect.any(Function),
      );
      expect(mockEthereum.removeListener).toHaveBeenCalledWith("disconnect", expect.any(Function));
    });

    eit("subscribe returns no-op with { signer } config", ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const unsub = ethersSigner.subscribe({ onDisconnect: vi.fn(), onAccountChange: vi.fn() });
      expect(typeof unsub).toBe("function");
      // Should not throw
      unsub();
    });
  });

  describe("getChainId", () => {
    eit(
      "returns the numeric chain ID from the provider network",
      async ({ createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

        const chainId = await ethersSigner.getChainId();
        expect(signer.provider.getNetwork).toHaveBeenCalled();
        expect(chainId).toBe(8009);
      },
    );

    eit("throws when signer has no provider", async ({ createEthersMockSigner }) => {
      const signer = { ...createEthersMockSigner(), provider: null };
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.getChainId()).rejects.toThrow("Signer has no provider");
    });
  });

  describe("getAddress", () => {
    eit("returns the hex address from the signer", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const address = await ethersSigner.getAddress();
      expect(address).toBe(MOCK_ADDRESS);
    });

    eit("throws when address does not start with 0x", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      signer.getAddress.mockResolvedValue("notHex");
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.getAddress()).rejects.toThrow(/invalid/i);
    });
  });

  describe("signTypedData", () => {
    eit(
      "delegates to signer.signTypedData, filtering out EIP712Domain",
      async ({ createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

        const typedData: EIP712TypedData = {
          domain: {
            name: "Test",
            version: "1",
            chainId: 1,
            verifyingContract: MOCK_ADDRESS,
          },
          types: {
            EIP712Domain: [{ name: "name", type: "string" }],
            Permit: [{ name: "owner", type: "address" }],
          },
          message: {
            publicKey: "0xkey",
            contractAddresses: [MOCK_ADDRESS],
            startTimestamp: 1000n,
            durationDays: 1n,
            extraData: "0x",
          },
        };

        const sig = await ethersSigner.signTypedData(typedData);

        expect(signer.signTypedData).toHaveBeenCalledWith(
          typedData.domain,
          { Permit: typedData.types.Permit },
          typedData.message,
        );
        expect(sig).toBe(MOCK_SIGNATURE);
      },
    );

    eit("throws when signature does not start with 0x", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      signer.signTypedData.mockResolvedValue("notHex");
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const typedData: EIP712TypedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 1,
          verifyingContract: MOCK_ADDRESS,
        },
        types: { EIP712Domain: [], Permit: [] },
        message: {
          publicKey: "0xkey",
          contractAddresses: [],
          startTimestamp: 1000n,
          durationDays: 1n,
          extraData: "0x",
        },
      };

      await expect(ethersSigner.signTypedData(typedData)).rejects.toThrow("Expected hex string");
    });
  });

  describe("writeContract", () => {
    eit(
      "creates an ethers Contract, calls the function, and returns the tx hash",
      async ({ tokenAddress, userAddress, createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

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
      },
    );

    eit(
      "passes value in overrides when provided",
      async ({ tokenAddress, userAddress, createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

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
      },
    );

    eit(
      "throws when tx hash does not start with 0x",
      async ({ tokenAddress, createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

        mockContractMethod.mockResolvedValueOnce({ hash: "notHex" });

        const config = {
          address: tokenAddress,
          abi: [],
          functionName: "fn",
          args: [],
        };

        await expect(ethersSigner.writeContract(config)).rejects.toThrow("Expected hex string");
      },
    );
  });

  describe("readContract", () => {
    eit(
      "creates an ethers Contract and calls the function with args",
      async ({ tokenAddress, userAddress, createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

        mockContractMethod.mockResolvedValueOnce(42n);

        const config = {
          address: tokenAddress,
          abi: [{ name: "balanceOf" }],
          functionName: "balanceOf",
          args: [userAddress] as const,
        };

        const result = await ethersSigner.readContract(config);
        expect(mockContractMethod).toHaveBeenCalledWith(userAddress);
        expect(result).toBe(42n);
      },
    );
  });

  describe("waitForTransactionReceipt", () => {
    eit("waits for the transaction and maps logs correctly", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const receipt = await ethersSigner.waitForTransactionReceipt("0xhash" as Hex);

      expect(signer.provider.waitForTransaction).toHaveBeenCalledWith("0xhash");
      expect(receipt.logs).toEqual([{ topics: ["0xtopic1", "0xtopic3"], data: "0xdata" }]);
    });

    eit("filters out null topics from logs", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      signer.provider.waitForTransaction.mockResolvedValue({
        logs: [{ topics: [null, "0xa", null, "0xb"], data: "0x" }],
      });
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const receipt = await ethersSigner.waitForTransactionReceipt("0xhash" as Hex);
      expect(receipt.logs[0]!.topics).toEqual(["0xa", "0xb"]);
    });

    eit("throws when signer has no provider", async ({ createEthersMockSigner }) => {
      const signer = { ...createEthersMockSigner(), provider: null };
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.waitForTransactionReceipt("0xhash" as Hex)).rejects.toThrow(
        "Signer has no provider",
      );
    });

    eit("throws when receipt is null", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      signer.provider.waitForTransaction.mockResolvedValue(null);
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.waitForTransactionReceipt("0xhash" as Hex)).rejects.toThrow(
        "Transaction receipt not found",
      );
    });
  });
});

// ── Read-only mode ({ provider } config) ────────────────────

describe("EthersSigner read-only mode ({ provider })", () => {
  eit("readContract works with provider-only config", async ({ tokenAddress, userAddress }) => {
    mockContractMethod.mockResolvedValue(42n);
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 1n }),
    };
    const ethersSigner = new EthersSigner({ provider: mockProvider as never });

    const result = await ethersSigner.readContract({
      address: tokenAddress,
      abi: [{ name: "balanceOf" }],
      functionName: "balanceOf",
      args: [userAddress],
    });
    expect(result).toBe(42n);
  });

  eit("getChainId works with provider-only config", async () => {
    const mockProvider = {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 8009n }),
    };
    const ethersSigner = new EthersSigner({ provider: mockProvider as never });

    const chainId = await ethersSigner.getChainId();
    expect(chainId).toBe(8009);
  });

  eit("getAddress throws with provider-only config", async () => {
    const mockProvider = { getNetwork: vi.fn() };
    const ethersSigner = new EthersSigner({ provider: mockProvider as never });

    await expect(ethersSigner.getAddress()).rejects.toThrow("No signer configured");
  });

  eit("signTypedData throws with provider-only config", async () => {
    const mockProvider = { getNetwork: vi.fn() };
    const ethersSigner = new EthersSigner({ provider: mockProvider as never });

    const typedData = {
      domain: {},
      types: { EIP712Domain: [], Transfer: [{ name: "to", type: "address" }] },
      message: {},
    };
    await expect(ethersSigner.signTypedData(typedData as never)).rejects.toThrow(
      "No signer configured",
    );
  });

  eit("writeContract throws with provider-only config", async ({ tokenAddress }) => {
    const mockProvider = { getNetwork: vi.fn() };
    const ethersSigner = new EthersSigner({ provider: mockProvider as never });

    await expect(
      ethersSigner.writeContract({
        address: tokenAddress,
        abi: [],
        functionName: "transfer",
        args: [],
      }),
    ).rejects.toThrow("No signer configured");
  });

  eit("subscribe returns no-op with provider-only config", () => {
    const mockProvider = { getNetwork: vi.fn() };
    const ethersSigner = new EthersSigner({ provider: mockProvider as never });

    const unsub = ethersSigner.subscribe({ onDisconnect: vi.fn(), onAccountChange: vi.fn() });
    expect(typeof unsub).toBe("function");
    unsub(); // should not throw
  });
});

// ── contracts.ts read helpers ────────────────────────────────

describe("ethers read contract helpers", () => {
  const mockProvider = { call: vi.fn() };

  eit("readConfidentialBalanceOfContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockProvider.call).mockResolvedValueOnce(
      encodeAbiParameters([{ type: "bytes32" }], [VALID_HANDLE]),
    );
    const result = await readConfidentialBalanceOfContract(mockProvider, tokenAddress, userAddress);
    expect(result).toBe(VALID_HANDLE);
  });

  eit("readWrapperForTokenContract", async ({ tokenAddress }) => {
    vi.mocked(mockProvider.call).mockResolvedValueOnce(
      encodeAbiParameters([{ type: "address" }], [MOCK_ADDRESS]),
    );
    const result = await readWrapperForTokenContract(mockProvider, COORDINATOR, tokenAddress);
    expect(result).toBe(MOCK_ADDRESS);
  });

  eit("readUnderlyingTokenContract", async ({ wrapperAddress }) => {
    vi.mocked(mockProvider.call).mockResolvedValueOnce(
      encodeAbiParameters([{ type: "address" }], [MOCK_ADDRESS]),
    );
    const result = await readUnderlyingTokenContract(mockProvider, wrapperAddress);
    expect(result).toBe(MOCK_ADDRESS);
  });

  eit("readWrapperExistsContract", async ({ tokenAddress }) => {
    vi.mocked(mockProvider.call).mockResolvedValueOnce(
      encodeAbiParameters([{ type: "bool" }], [true]),
    );
    const result = await readWrapperExistsContract(mockProvider, COORDINATOR, tokenAddress);
    expect(result).toBe(true);
  });

  eit("readSupportsInterfaceContract", async ({ tokenAddress }) => {
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

  eit("writeConfidentialTransferContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const handle = new Uint8Array(32).fill(1);
    const proof = new Uint8Array(32).fill(2);
    const hash = await writeConfidentialTransferContract(
      mockSigner,
      tokenAddress,
      userAddress,
      handle,
      proof,
    );
    expect(hash).toBe(TX_HASH);
  });

  eit("writeConfidentialBatchTransferContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const batchData = [
      {
        to: userAddress,
        encryptedAmount: VALID_HANDLE as Address,
        inputProof: VALID_PROOF as Address,
        retryFor: 0n,
      },
    ];
    const hash = await writeConfidentialBatchTransferContract(
      mockSigner,
      BATCHER,
      tokenAddress,
      userAddress,
      batchData,
      10n,
    );
    expect(hash).toBe(TX_HASH);
  });

  eit("writeUnwrapContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const handle = new Uint8Array(32).fill(0xde);
    const proof = new Uint8Array(32).fill(0xef);
    const hash = await writeUnwrapContract(
      mockSigner,
      tokenAddress,
      userAddress,
      SPENDER,
      handle,
      proof,
    );
    expect(hash).toBe(TX_HASH);
  });

  eit("writeUnwrapFromBalanceContract", async ({ tokenAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const balance = VALID_HANDLE as Address;
    const hash = await writeUnwrapFromBalanceContract(
      mockSigner,
      tokenAddress,
      userAddress,
      SPENDER,
      balance,
    );
    expect(hash).toBe(TX_HASH);
  });

  eit("writeFinalizeUnwrapContract", async ({ wrapperAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const burnt = VALID_HANDLE as Address;
    const proof = VALID_PROOF as Address;
    const hash = await writeFinalizeUnwrapContract(mockSigner, wrapperAddress, burnt, 500n, proof);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeSetOperatorContract", async ({ tokenAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeSetOperatorContract(mockSigner, tokenAddress, SPENDER, 12345);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeSetOperatorContract without explicit timestamp", async ({ tokenAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeSetOperatorContract(mockSigner, tokenAddress, SPENDER);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeWrapContract", async ({ wrapperAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeWrapContract(mockSigner, wrapperAddress, userAddress, 1000n);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeWrapETHContract", async ({ wrapperAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: TX_HASH });
    const hash = await writeWrapETHContract(mockSigner, wrapperAddress, userAddress, 500n, 500n);
    expect(hash).toBe(TX_HASH);
  });

  eit("write helpers reject when tx hash is not hex", async ({ wrapperAddress, userAddress }) => {
    vi.mocked(mockSigner.sendTransaction).mockResolvedValueOnce({ hash: "notHex" });
    await expect(writeWrapContract(mockSigner, wrapperAddress, userAddress, 1000n)).rejects.toThrow(
      "Expected hex string",
    );
  });
});
