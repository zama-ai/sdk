import { vi } from "vitest";
import { test as base, describe, expect } from "../../test-fixtures";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { Hex } from "../../token/token.types";

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

const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;
const BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const TX_HASH = "0xdeadbeef" as Hex;

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
      getAddress: vi.fn().mockResolvedValue("0xMyAddress"),
      signTypedData: vi.fn().mockResolvedValue("0xSignature"),
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
        expect(address).toBe("0xMyAddress");
      },
    );

    eit("accepts a Signer directly", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const address = await ethersSigner.getAddress();
      expect(signer.getAddress).toHaveBeenCalled();
      expect(address).toBe("0xMyAddress");
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
      expect(mockEthereum.on).toHaveBeenCalledWith("disconnect", onDisconnect);
      expect(typeof unsub).toBe("function");

      unsub();
      expect(mockEthereum.removeListener).toHaveBeenCalledWith(
        "accountsChanged",
        expect.any(Function),
      );
      expect(mockEthereum.removeListener).toHaveBeenCalledWith("disconnect", onDisconnect);
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
      expect(address).toBe("0xMyAddress");
    });

    eit("throws when address does not start with 0x", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      signer.getAddress.mockResolvedValue("notHex");
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.getAddress()).rejects.toThrow("Expected hex string");
    });
  });

  describe("signTypedData", () => {
    eit(
      "delegates to signer.signTypedData, filtering out EIP712Domain",
      async ({ createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

        const typedData = {
          domain: {
            name: "Test",
            version: "1",
            chainId: 1,
            verifyingContract: "0xcontract" as Address,
          },
          types: {
            EIP712Domain: [{ name: "name", type: "string" }],
            Permit: [{ name: "owner", type: "address" }],
          },
          message: {
            publicKey: "0xkey",
            contractAddresses: ["0xcontract"],
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
        expect(sig).toBe("0xSignature");
      },
    );

    eit("throws when signature does not start with 0x", async ({ createEthersMockSigner }) => {
      const signer = createEthersMockSigner();
      signer.signTypedData.mockResolvedValue("notHex");
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const typedData = {
        domain: {
          name: "Test",
          version: "1",
          chainId: 1,
          verifyingContract: "0xcontract" as Address,
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

        mockContractMethod.mockResolvedValueOnce({ hash: "0xTxHash" });

        const config = {
          address: tokenAddress,
          abi: [{ name: "transfer" }],
          functionName: "transfer",
          args: [userAddress, 100n] as const,
        };

        const hash = await ethersSigner.writeContract(config);
        expect(mockContractMethod).toHaveBeenCalledWith(userAddress, 100n, {});
        expect(hash).toBe("0xTxHash");
      },
    );

    eit(
      "passes value in overrides when provided",
      async ({ tokenAddress, userAddress, createEthersMockSigner }) => {
        const signer = createEthersMockSigner();
        const ethersSigner = new EthersSigner({ signer: signer as never });

        mockContractMethod.mockResolvedValueOnce({ hash: "0xTxHash" });

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

// ── contracts.ts read helpers ────────────────────────────────

describe("ethers read contract helpers", () => {
  const mockProvider = {} as never;

  eit("readConfidentialBalanceOfContract", async ({ tokenAddress, userAddress }) => {
    mockContractMethod.mockResolvedValue("0xresult");
    const result = await readConfidentialBalanceOfContract(mockProvider, tokenAddress, userAddress);
    expect(result).toBe("0xresult");
  });

  eit("readWrapperForTokenContract", async ({ tokenAddress }) => {
    mockContractMethod.mockResolvedValue("0xresult");
    const result = await readWrapperForTokenContract(mockProvider, COORDINATOR, tokenAddress);
    expect(result).toBe("0xresult");
  });

  eit("readUnderlyingTokenContract", async ({ wrapperAddress }) => {
    mockContractMethod.mockResolvedValue("0xresult");
    const result = await readUnderlyingTokenContract(mockProvider, wrapperAddress);
    expect(result).toBe("0xresult");
  });

  eit("readWrapperExistsContract", async ({ tokenAddress }) => {
    mockContractMethod.mockResolvedValue("0xresult");
    const result = await readWrapperExistsContract(mockProvider, COORDINATOR, tokenAddress);
    expect(result).toBe("0xresult");
  });

  eit("readSupportsInterfaceContract", async ({ tokenAddress }) => {
    mockContractMethod.mockResolvedValue("0xresult");
    const interfaceId = "0x12345678" as Address;
    const result = await readSupportsInterfaceContract(mockProvider, tokenAddress, interfaceId);
    expect(result).toBe("0xresult");
  });
});

// ── contracts.ts write helpers ───────────────────────────────

describe("ethers write contract helpers", () => {
  const mockSigner = {} as never;

  eit("writeConfidentialTransferContract", async ({ tokenAddress, userAddress }) => {
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const handle = new Uint8Array([1, 2, 3]);
    const proof = new Uint8Array([4, 5, 6]);
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
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const batchData = [
      {
        to: userAddress,
        encryptedAmount: "0xhandle" as Address,
        inputProof: "0xproof" as Address,
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
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const handle = new Uint8Array([0xde, 0xad]);
    const proof = new Uint8Array([0xbe, 0xef]);
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
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const balance = "0xbalance" as Address;
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
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const burnt = "0xburnt" as Address;
    const proof = "0xproof" as Address;
    const hash = await writeFinalizeUnwrapContract(mockSigner, wrapperAddress, burnt, 500n, proof);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeSetOperatorContract", async ({ tokenAddress }) => {
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const hash = await writeSetOperatorContract(mockSigner, tokenAddress, SPENDER, 12345);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeSetOperatorContract without explicit timestamp", async ({ tokenAddress }) => {
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const hash = await writeSetOperatorContract(mockSigner, tokenAddress, SPENDER);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeWrapContract", async ({ wrapperAddress, userAddress }) => {
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const hash = await writeWrapContract(mockSigner, wrapperAddress, userAddress, 1000n);
    expect(hash).toBe(TX_HASH);
  });

  eit("writeWrapETHContract", async ({ wrapperAddress, userAddress }) => {
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
    const hash = await writeWrapETHContract(mockSigner, wrapperAddress, userAddress, 500n, 500n);
    expect(hash).toBe(TX_HASH);
  });

  eit("write helpers reject when tx hash is not hex", async ({ wrapperAddress, userAddress }) => {
    mockContractMethod.mockResolvedValue({ hash: "notHex" });
    await expect(writeWrapContract(mockSigner, wrapperAddress, userAddress, 1000n)).rejects.toThrow(
      "Expected hex string",
    );
  });
});
