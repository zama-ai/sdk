import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PublicClient, WalletClient } from "viem";
import type { Address } from "../../relayer/relayer-sdk.types";
import type { Hex } from "../../token/token.types";
import { ViemSigner } from "../viem-signer";
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

// ── Constants ────────────────────────────────────────────

const ACCOUNT_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as Address;
const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const USER = "0x2222222222222222222222222222222222222222" as Address;
const SPENDER = "0x3333333333333333333333333333333333333333" as Address;
const WRAPPER = "0x4444444444444444444444444444444444444444" as Address;
const COORDINATOR = "0x5555555555555555555555555555555555555555" as Address;
const BATCHER = "0x7777777777777777777777777777777777777777" as Address;
const TX_HASH = "0xtxhash" as Hex;
const MOCK_CHAIN = { id: 1, name: "mainnet" } as WalletClient["chain"];

// ── Mock factories ───────────────────────────────────────

function createMockPublicClient(): PublicClient {
  return {
    getChainId: vi.fn().mockResolvedValue(1),
    readContract: vi.fn().mockResolvedValue("0xresult"),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
  } as unknown as PublicClient;
}

function createMockWalletClient(withAccount = true): WalletClient {
  return {
    account: withAccount ? { address: ACCOUNT_ADDRESS, type: "json-rpc" } : undefined,
    chain: MOCK_CHAIN,
    signTypedData: vi.fn().mockResolvedValue("0xsignature"),
    writeContract: vi.fn().mockResolvedValue(TX_HASH),
  } as unknown as WalletClient;
}

// ── ViemSigner ───────────────────────────────────────────

describe("ViemSigner", () => {
  let publicClient: PublicClient;
  let walletClient: WalletClient;
  let signer: ViemSigner;

  beforeEach(() => {
    publicClient = createMockPublicClient();
    walletClient = createMockWalletClient();
    signer = new ViemSigner({ walletClient, publicClient });
  });

  describe("getChainId", () => {
    it("delegates to publicClient.getChainId", async () => {
      const chainId = await signer.getChainId();
      expect(chainId).toBe(1);
      expect(publicClient.getChainId).toHaveBeenCalledOnce();
    });
  });

  describe("getAddress", () => {
    it("returns the wallet account address", async () => {
      const address = await signer.getAddress();
      expect(address).toBe(ACCOUNT_ADDRESS);
    });

    it("throws when wallet client has no account", async () => {
      const noAccountClient = createMockWalletClient(false);
      const noAccountSigner = new ViemSigner({ walletClient: noAccountClient, publicClient });
      await expect(noAccountSigner.getAddress()).rejects.toThrow("Invalid address");
    });
  });

  describe("signTypedData", () => {
    const typedData = {
      domain: { name: "Test", version: "1", chainId: 1, verifyingContract: TOKEN },
      types: { Transfer: [{ name: "to", type: "address" }] },
      message: {
        publicKey: "0xkey",
        contractAddresses: ["0x1"],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    };

    it("delegates to walletClient.signTypedData with account and primaryType", async () => {
      const result = await signer.signTypedData(typedData);
      expect(result).toBe("0xsignature");
      expect(walletClient.signTypedData).toHaveBeenCalledWith({
        account: walletClient.account,
        primaryType: "Transfer",
        ...typedData,
      });
    });

    it("throws when wallet client has no account", async () => {
      const noAccountClient = createMockWalletClient(false);
      const noAccountSigner = new ViemSigner({ walletClient: noAccountClient, publicClient });
      await expect(noAccountSigner.signTypedData(typedData)).rejects.toThrow(
        "WalletClient has no account",
      );
    });
  });

  describe("writeContract", () => {
    const config = {
      address: TOKEN,
      abi: [{ name: "transfer" }],
      functionName: "transfer",
      args: [USER, 100n],
    };

    it("delegates to walletClient.writeContract with chain and account", async () => {
      const result = await signer.writeContract(config);
      expect(result).toBe(TX_HASH);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: TOKEN,
          functionName: "transfer",
          args: [USER, 100n],
        }),
      );
    });

    it("throws when wallet client has no account", async () => {
      const noAccountClient = createMockWalletClient(false);
      const noAccountSigner = new ViemSigner({ walletClient: noAccountClient, publicClient });
      await expect(noAccountSigner.writeContract(config)).rejects.toThrow(
        "WalletClient has no account",
      );
    });
  });

  describe("readContract", () => {
    const config = {
      address: TOKEN,
      abi: [{ name: "balanceOf" }],
      functionName: "balanceOf",
      args: [USER],
    };

    it("delegates to publicClient.readContract", async () => {
      const result = await signer.readContract(config);
      expect(result).toBe("0xresult");
      expect(publicClient.readContract).toHaveBeenCalledWith(config);
    });
  });

  describe("waitForTransactionReceipt", () => {
    it("delegates to publicClient.waitForTransactionReceipt", async () => {
      const receipt = await signer.waitForTransactionReceipt(TX_HASH);
      expect(receipt).toEqual({ logs: [] });
      expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
        hash: TX_HASH,
      });
    });
  });
});

// ── Read contract helpers ────────────────────────────────

describe("Viem read contract helpers", () => {
  let publicClient: PublicClient;

  beforeEach(() => {
    publicClient = createMockPublicClient();
  });

  it("readConfidentialBalanceOfContract calls readContract with correct config", () => {
    readConfidentialBalanceOfContract(publicClient, TOKEN, USER);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: "confidentialBalanceOf",
        args: [USER],
      }),
    );
  });

  it("readWrapperForTokenContract calls readContract with correct config", () => {
    readWrapperForTokenContract(publicClient, COORDINATOR, TOKEN);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: COORDINATOR,
        functionName: "getWrapper",
        args: [TOKEN],
      }),
    );
  });

  it("readUnderlyingTokenContract calls readContract with correct config", () => {
    readUnderlyingTokenContract(publicClient, WRAPPER);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: WRAPPER,
        functionName: "underlying",
      }),
    );
  });

  it("readWrapperExistsContract calls readContract with correct config", () => {
    readWrapperExistsContract(publicClient, COORDINATOR, TOKEN);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: COORDINATOR,
        functionName: "wrapperExists",
        args: [TOKEN],
      }),
    );
  });

  it("readSupportsInterfaceContract calls readContract with correct config", () => {
    const interfaceId = "0x12345678" as Address;
    readSupportsInterfaceContract(publicClient, TOKEN, interfaceId);
    expect(publicClient.readContract).toHaveBeenCalledWith(
      expect.objectContaining({
        address: TOKEN,
        functionName: "supportsInterface",
        args: [interfaceId],
      }),
    );
  });
});

// ── Write contract helpers ───────────────────────────────

describe("Viem write contract helpers", () => {
  let walletClient: WalletClient;

  beforeEach(() => {
    walletClient = createMockWalletClient();
  });

  describe("requireAccount behavior", () => {
    it("throws when wallet client has no account", () => {
      const noAccountClient = createMockWalletClient(false);
      expect(() =>
        writeConfidentialTransferContract(
          noAccountClient,
          TOKEN,
          USER,
          new Uint8Array([1]),
          new Uint8Array([2]),
        ),
      ).toThrow("WalletClient has no account");
    });
  });

  it("writeConfidentialTransferContract calls writeContract with correct config", () => {
    const handle = new Uint8Array([0xab, 0xcd]);
    const proof = new Uint8Array([0xef]);
    writeConfidentialTransferContract(walletClient, TOKEN, USER, handle, proof);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: TOKEN,
        functionName: "confidentialTransfer",
        args: [USER, "0xabcd", "0xef"],
      }),
    );
  });

  it("writeConfidentialBatchTransferContract calls writeContract with correct config", () => {
    const batchData = [
      {
        to: USER,
        encryptedAmount: "0xhandle" as Address,
        inputProof: "0xproof" as Address,
        retryFor: 0n,
      },
    ];
    writeConfidentialBatchTransferContract(walletClient, BATCHER, TOKEN, USER, batchData, 10n);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: BATCHER,
        functionName: "confidentialBatchTransfer",
        args: [TOKEN, USER, batchData],
        value: 10n,
      }),
    );
  });

  it("writeUnwrapContract calls writeContract with correct config", () => {
    const handle = new Uint8Array([0xde, 0xad]);
    const proof = new Uint8Array([0xbe, 0xef]);
    writeUnwrapContract(walletClient, TOKEN, USER, SPENDER, handle, proof);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: TOKEN,
        functionName: "unwrap",
        args: [USER, SPENDER, "0xdead", "0xbeef"],
      }),
    );
  });

  it("writeUnwrapFromBalanceContract calls writeContract with correct config", () => {
    const encryptedBalance = "0xbalance" as Address;
    writeUnwrapFromBalanceContract(walletClient, TOKEN, USER, SPENDER, encryptedBalance);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: TOKEN,
        functionName: "unwrap",
        args: [USER, SPENDER, encryptedBalance],
      }),
    );
  });

  it("writeFinalizeUnwrapContract calls writeContract with correct config", () => {
    const burntAmount = "0xburnt" as Address;
    const proof = "0xproof" as Address;
    writeFinalizeUnwrapContract(walletClient, WRAPPER, burntAmount, 500n, proof);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: WRAPPER,
        functionName: "finalizeUnwrap",
        args: [burntAmount, 500n, proof],
      }),
    );
  });

  it("writeSetOperatorContract calls writeContract with correct config", () => {
    writeSetOperatorContract(walletClient, TOKEN, SPENDER, 12345);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: TOKEN,
        functionName: "setOperator",
        args: [SPENDER, 12345],
      }),
    );
  });

  it("writeSetOperatorContract uses default timestamp when not provided", () => {
    const before = Math.floor(Date.now() / 1000) + 3600;
    writeSetOperatorContract(walletClient, TOKEN, SPENDER);
    const after = Math.floor(Date.now() / 1000) + 3600;

    const callArgs = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    const timestamp = callArgs.args[1] as number;
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("writeWrapContract calls writeContract with correct config", () => {
    writeWrapContract(walletClient, WRAPPER, USER, 1000n);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: WRAPPER,
        functionName: "wrap",
        args: [USER, 1000n],
      }),
    );
  });

  it("writeWrapETHContract calls writeContract with correct config and value", () => {
    writeWrapETHContract(walletClient, WRAPPER, USER, 500n, 500n);
    expect(walletClient.writeContract).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: MOCK_CHAIN,
        account: walletClient.account,
        address: WRAPPER,
        functionName: "wrapETH",
        args: [USER, 500n],
        value: 500n,
      }),
    );
  });

  describe("all write helpers throw without account", () => {
    let noAccountClient: WalletClient;

    beforeEach(() => {
      noAccountClient = createMockWalletClient(false);
    });

    it("writeConfidentialBatchTransferContract", () => {
      expect(() =>
        writeConfidentialBatchTransferContract(noAccountClient, BATCHER, TOKEN, USER, [], 0n),
      ).toThrow("WalletClient has no account");
    });

    it("writeUnwrapContract", () => {
      expect(() =>
        writeUnwrapContract(
          noAccountClient,
          TOKEN,
          USER,
          SPENDER,
          new Uint8Array(),
          new Uint8Array(),
        ),
      ).toThrow("WalletClient has no account");
    });

    it("writeUnwrapFromBalanceContract", () => {
      expect(() =>
        writeUnwrapFromBalanceContract(noAccountClient, TOKEN, USER, SPENDER, "0x0" as Address),
      ).toThrow("WalletClient has no account");
    });

    it("writeFinalizeUnwrapContract", () => {
      expect(() =>
        writeFinalizeUnwrapContract(
          noAccountClient,
          WRAPPER,
          "0x0" as Address,
          0n,
          "0x0" as Address,
        ),
      ).toThrow("WalletClient has no account");
    });

    it("writeSetOperatorContract", () => {
      expect(() => writeSetOperatorContract(noAccountClient, TOKEN, SPENDER)).toThrow(
        "WalletClient has no account",
      );
    });

    it("writeWrapContract", () => {
      expect(() => writeWrapContract(noAccountClient, WRAPPER, USER, 0n)).toThrow(
        "WalletClient has no account",
      );
    });

    it("writeWrapETHContract", () => {
      expect(() => writeWrapETHContract(noAccountClient, WRAPPER, USER, 0n, 0n)).toThrow(
        "WalletClient has no account",
      );
    });
  });
});
