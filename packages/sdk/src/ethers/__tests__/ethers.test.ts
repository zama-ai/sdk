import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { Hex } from "../../token/token.types";

// ── Mock ethers ──────────────────────────────────────────────

const { mockContractMethod, MockContract } = vi.hoisted(() => {
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

  return { mockContractMethod, MockContract };
});

vi.mock("ethers", () => {
  return {
    ethers: { Contract: MockContract },
    Contract: MockContract,
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

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;
const BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const TX_HASH = "0xdeadbeef" as Hex;

// ── Helpers ──────────────────────────────────────────────────

function createMockSigner() {
  return {
    getAddress: vi.fn().mockResolvedValue("0xMyAddress"),
    signTypedData: vi.fn().mockResolvedValue("0xSignature"),
    provider: {
      getNetwork: vi.fn().mockResolvedValue({ chainId: 8009n }),
      waitForTransaction: vi.fn().mockResolvedValue({
        logs: [{ topics: ["0xtopic1", null, "0xtopic3"], data: "0xdata" }],
      }),
    },
  };
}

function createMockBrowserProvider() {
  const signer = createMockSigner();
  return {
    browserProvider: { getSigner: vi.fn().mockResolvedValue(signer) },
    signer,
  };
}

// ── EthersSigner ─────────────────────────────────────────────

describe("EthersSigner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("accepts a BrowserProvider and lazily resolves its signer", async () => {
      const { browserProvider, signer } = createMockBrowserProvider();
      const ethersSigner = new EthersSigner({ signer: browserProvider as never });

      const address = await ethersSigner.getAddress();
      expect(browserProvider.getSigner).toHaveBeenCalled();
      expect(signer.getAddress).toHaveBeenCalled();
      expect(address).toBe("0xMyAddress");
    });

    it("accepts a Signer directly", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const address = await ethersSigner.getAddress();
      expect(signer.getAddress).toHaveBeenCalled();
      expect(address).toBe("0xMyAddress");
    });
  });

  describe("getChainId", () => {
    it("returns the numeric chain ID from the provider network", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const chainId = await ethersSigner.getChainId();
      expect(signer.provider.getNetwork).toHaveBeenCalled();
      expect(chainId).toBe(8009);
    });

    it("throws when signer has no provider", async () => {
      const signer = { ...createMockSigner(), provider: null };
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.getChainId()).rejects.toThrow("Signer has no provider");
    });
  });

  describe("getAddress", () => {
    it("returns the hex address from the signer", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const address = await ethersSigner.getAddress();
      expect(address).toBe("0xMyAddress");
    });

    it("throws when address does not start with 0x", async () => {
      const signer = createMockSigner();
      signer.getAddress.mockResolvedValue("notHex");
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.getAddress()).rejects.toThrow("Expected hex string");
    });
  });

  describe("signTypedData", () => {
    it("delegates to signer.signTypedData, filtering out EIP712Domain", async () => {
      const signer = createMockSigner();
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
    });

    it("throws when signature does not start with 0x", async () => {
      const signer = createMockSigner();
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
    it("creates an ethers Contract, calls the function, and returns the tx hash", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      mockContractMethod.mockResolvedValueOnce({ hash: "0xTxHash" });

      const config = {
        address: TOKEN,
        abi: [{ name: "transfer" }],
        functionName: "transfer",
        args: [USER, 100n] as const,
      };

      const hash = await ethersSigner.writeContract(config);
      expect(mockContractMethod).toHaveBeenCalledWith(USER, 100n, {});
      expect(hash).toBe("0xTxHash");
    });

    it("passes value in overrides when provided", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      mockContractMethod.mockResolvedValueOnce({ hash: "0xTxHash" });

      const config = {
        address: TOKEN,
        abi: [{ name: "wrapETH" }],
        functionName: "wrapETH",
        args: [USER, 500n] as const,
        value: 500n,
      };

      await ethersSigner.writeContract(config);
      expect(mockContractMethod).toHaveBeenCalledWith(USER, 500n, { value: 500n });
    });

    it("throws when tx hash does not start with 0x", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      mockContractMethod.mockResolvedValueOnce({ hash: "notHex" });

      const config = {
        address: TOKEN,
        abi: [],
        functionName: "fn",
        args: [],
      };

      await expect(ethersSigner.writeContract(config)).rejects.toThrow("Expected hex string");
    });
  });

  describe("readContract", () => {
    it("creates an ethers Contract and calls the function with args", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      mockContractMethod.mockResolvedValueOnce(42n);

      const config = {
        address: TOKEN,
        abi: [{ name: "balanceOf" }],
        functionName: "balanceOf",
        args: [USER] as const,
      };

      const result = await ethersSigner.readContract(config);
      expect(mockContractMethod).toHaveBeenCalledWith(USER);
      expect(result).toBe(42n);
    });
  });

  describe("waitForTransactionReceipt", () => {
    it("waits for the transaction and maps logs correctly", async () => {
      const signer = createMockSigner();
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const receipt = await ethersSigner.waitForTransactionReceipt("0xhash" as Hex);

      expect(signer.provider.waitForTransaction).toHaveBeenCalledWith("0xhash");
      expect(receipt.logs).toEqual([{ topics: ["0xtopic1", "0xtopic3"], data: "0xdata" }]);
    });

    it("filters out null topics from logs", async () => {
      const signer = createMockSigner();
      signer.provider.waitForTransaction.mockResolvedValue({
        logs: [{ topics: [null, "0xa", null, "0xb"], data: "0x" }],
      });
      const ethersSigner = new EthersSigner({ signer: signer as never });

      const receipt = await ethersSigner.waitForTransactionReceipt("0xhash" as Hex);
      expect(receipt.logs[0]!.topics).toEqual(["0xa", "0xb"]);
    });

    it("throws when signer has no provider", async () => {
      const signer = { ...createMockSigner(), provider: null };
      const ethersSigner = new EthersSigner({ signer: signer as never });

      await expect(ethersSigner.waitForTransactionReceipt("0xhash" as Hex)).rejects.toThrow(
        "Signer has no provider",
      );
    });

    it("throws when receipt is null", async () => {
      const signer = createMockSigner();
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

  beforeEach(() => {
    vi.clearAllMocks();
    mockContractMethod.mockResolvedValue("0xresult");
  });

  it("readConfidentialBalanceOfContract", async () => {
    const result = await readConfidentialBalanceOfContract(mockProvider, TOKEN, USER);
    expect(result).toBe("0xresult");
  });

  it("readWrapperForTokenContract", async () => {
    const result = await readWrapperForTokenContract(mockProvider, COORDINATOR, TOKEN);
    expect(result).toBe("0xresult");
  });

  it("readUnderlyingTokenContract", async () => {
    const result = await readUnderlyingTokenContract(mockProvider, WRAPPER);
    expect(result).toBe("0xresult");
  });

  it("readWrapperExistsContract", async () => {
    const result = await readWrapperExistsContract(mockProvider, COORDINATOR, TOKEN);
    expect(result).toBe("0xresult");
  });

  it("readSupportsInterfaceContract", async () => {
    const interfaceId = "0x12345678" as Address;
    const result = await readSupportsInterfaceContract(mockProvider, TOKEN, interfaceId);
    expect(result).toBe("0xresult");
  });
});

// ── contracts.ts write helpers ───────────────────────────────

describe("ethers write contract helpers", () => {
  const mockSigner = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContractMethod.mockResolvedValue({ hash: TX_HASH });
  });

  it("writeConfidentialTransferContract", async () => {
    const handle = new Uint8Array([1, 2, 3]);
    const proof = new Uint8Array([4, 5, 6]);
    const hash = await writeConfidentialTransferContract(mockSigner, TOKEN, USER, handle, proof);
    expect(hash).toBe(TX_HASH);
  });

  it("writeConfidentialBatchTransferContract", async () => {
    const batchData = [
      {
        to: USER,
        encryptedAmount: "0xhandle" as Address,
        inputProof: "0xproof" as Address,
        retryFor: 0n,
      },
    ];
    const hash = await writeConfidentialBatchTransferContract(
      mockSigner,
      BATCHER,
      TOKEN,
      USER,
      batchData,
      10n,
    );
    expect(hash).toBe(TX_HASH);
  });

  it("writeUnwrapContract", async () => {
    const handle = new Uint8Array([0xde, 0xad]);
    const proof = new Uint8Array([0xbe, 0xef]);
    const hash = await writeUnwrapContract(mockSigner, TOKEN, USER, SPENDER, handle, proof);
    expect(hash).toBe(TX_HASH);
  });

  it("writeUnwrapFromBalanceContract", async () => {
    const balance = "0xbalance" as Address;
    const hash = await writeUnwrapFromBalanceContract(mockSigner, TOKEN, USER, SPENDER, balance);
    expect(hash).toBe(TX_HASH);
  });

  it("writeFinalizeUnwrapContract", async () => {
    const burnt = "0xburnt" as Address;
    const proof = "0xproof" as Address;
    const hash = await writeFinalizeUnwrapContract(mockSigner, WRAPPER, burnt, 500n, proof);
    expect(hash).toBe(TX_HASH);
  });

  it("writeSetOperatorContract", async () => {
    const hash = await writeSetOperatorContract(mockSigner, TOKEN, SPENDER, 12345);
    expect(hash).toBe(TX_HASH);
  });

  it("writeSetOperatorContract without explicit timestamp", async () => {
    const hash = await writeSetOperatorContract(mockSigner, TOKEN, SPENDER);
    expect(hash).toBe(TX_HASH);
  });

  it("writeWrapContract", async () => {
    const hash = await writeWrapContract(mockSigner, WRAPPER, USER, 1000n);
    expect(hash).toBe(TX_HASH);
  });

  it("writeWrapETHContract", async () => {
    const hash = await writeWrapETHContract(mockSigner, WRAPPER, USER, 500n, 500n);
    expect(hash).toBe(TX_HASH);
  });

  it("write helpers reject when tx hash is not hex", async () => {
    mockContractMethod.mockResolvedValue({ hash: "notHex" });
    await expect(writeWrapContract(mockSigner, WRAPPER, USER, 1000n)).rejects.toThrow(
      "Expected hex string",
    );
  });
});
