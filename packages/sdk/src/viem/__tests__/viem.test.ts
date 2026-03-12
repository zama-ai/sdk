/* eslint-disable no-empty-pattern */
import type { PublicClient, WalletClient, Address, Hex } from "viem";
import type { EIP712TypedData } from "../../relayer/relayer-sdk.types";
import { test as base, describe, expect, vi } from "../../test-fixtures";

import {
  readConfidentialBalanceOfContract,
  readSupportsInterfaceContract,
  readUnderlyingTokenContract,
  readWrapperExistsContract,
  readWrapperForTokenContract,
  writeConfidentialBatchTransferContract,
  writeConfidentialTransferContract,
  writeFinalizeUnwrapContract,
  writeSetOperatorContract,
  writeUnwrapContract,
  writeUnwrapFromBalanceContract,
  writeWrapContract,
  writeWrapETHContract,
} from "../contracts";
import { ViemSigner } from "../viem-signer";

// ── Constants ────────────────────────────────────────────

const ACCOUNT_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const SPENDER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;
const COORDINATOR = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address;
const BATCHER = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const TX_HASH = "0xtxhash" as Hex;
const MOCK_CHAIN = { id: 1, name: "mainnet" } as WalletClient["chain"];

// ── Viem-specific fixtures ──────────────────────────────

interface ViemFixtures {
  publicClient: PublicClient;
  walletClient: WalletClient;
  viemSigner: ViemSigner;
  createMockWalletClient: (withAccount?: boolean) => WalletClient;
  createMockPublicClient: () => PublicClient;
}

const viemTest = base.extend<ViemFixtures>({
  createMockPublicClient: async ({}, use) => {
    await use(
      () =>
        ({
          getChainId: vi.fn().mockResolvedValue(1),
          readContract: vi.fn().mockResolvedValue("0xresult"),
          waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
          getBlock: vi.fn().mockResolvedValue({ timestamp: 1700000000n }),
        }) as unknown as PublicClient,
    );
  },
  createMockWalletClient: async ({}, use) => {
    await use(
      (withAccount = true) =>
        ({
          account: withAccount ? { address: ACCOUNT_ADDRESS, type: "json-rpc" } : undefined,
          chain: MOCK_CHAIN,
          signTypedData: vi.fn().mockResolvedValue("0xsignature"),
          writeContract: vi.fn().mockResolvedValue(TX_HASH),
        }) as unknown as WalletClient,
    );
  },
  publicClient: async ({ createMockPublicClient }, use) => {
    await use(createMockPublicClient());
  },
  walletClient: async ({ createMockWalletClient }, use) => {
    await use(createMockWalletClient());
  },
  viemSigner: async ({ walletClient, publicClient }, use) => {
    await use(new ViemSigner({ walletClient, publicClient }));
  },
});

// Re-alias it for viem-specific tests
const vit = viemTest;

// ── ViemSigner ───────────────────────────────────────────

describe("ViemSigner", () => {
  describe("getChainId", () => {
    vit("delegates to publicClient.getChainId", async ({ viemSigner, publicClient }) => {
      const chainId = await viemSigner.getChainId();
      expect(chainId).toBe(1);
      expect(publicClient.getChainId).toHaveBeenCalledOnce();
    });
  });

  describe("getAddress", () => {
    vit("returns the wallet account address", async ({ viemSigner }) => {
      const address = await viemSigner.getAddress();
      expect(address).toBe(ACCOUNT_ADDRESS);
    });

    vit(
      "throws when wallet client has no account",
      async ({ createMockWalletClient, publicClient }) => {
        const noAccountClient = createMockWalletClient(false);
        const noAccountSigner = new ViemSigner({ walletClient: noAccountClient, publicClient });
        await expect(noAccountSigner.getAddress()).rejects.toThrow("WalletClient has no account");
      },
    );
  });

  describe("signTypedData", () => {
    function createTypedData(tokenAddress: Address): EIP712TypedData {
      return {
        domain: { name: "Test", version: "1", chainId: 1, verifyingContract: tokenAddress },
        types: { Transfer: [{ name: "to", type: "address" }] },
        message: {
          publicKey: "0xkey",
          contractAddresses: ["0x1" as Address],
          startTimestamp: 1000n,
          durationDays: 1n,
          extraData: "0x",
        },
      };
    }

    vit(
      "delegates to walletClient.signTypedData with account and primaryType",
      async ({ tokenAddress, viemSigner, walletClient }) => {
        const typedData = createTypedData(tokenAddress);
        const result = await viemSigner.signTypedData(typedData);
        expect(result).toBe("0xsignature");
        expect(walletClient.signTypedData).toHaveBeenCalledWith({
          account: walletClient.account,
          primaryType: "Transfer",
          ...typedData,
        });
      },
    );

    vit(
      "throws when wallet client has no account",
      async ({ tokenAddress, createMockWalletClient, publicClient }) => {
        const typedData = createTypedData(tokenAddress);
        const noAccountClient = createMockWalletClient(false);
        const noAccountSigner = new ViemSigner({ walletClient: noAccountClient, publicClient });
        await expect(noAccountSigner.signTypedData(typedData)).rejects.toThrow(
          "WalletClient has no account",
        );
      },
    );
  });

  describe("writeContract", () => {
    function createConfig(tokenAddress: Address, userAddress: Address) {
      return {
        address: tokenAddress,
        abi: [{ name: "transfer" }],
        functionName: "transfer",
        args: [userAddress, 100n],
      };
    }

    vit(
      "delegates to walletClient.writeContract with chain and account",
      async ({ tokenAddress, userAddress, viemSigner, walletClient }) => {
        const config = createConfig(tokenAddress, userAddress);
        const result = await viemSigner.writeContract(config);
        expect(result).toBe(TX_HASH);
        expect(walletClient.writeContract).toHaveBeenCalledWith(
          expect.objectContaining({
            chain: MOCK_CHAIN,
            account: walletClient.account,
            address: tokenAddress,
            functionName: "transfer",
            args: [userAddress, 100n],
          }),
        );
      },
    );

    vit(
      "throws when wallet client has no account",
      async ({ tokenAddress, userAddress, createMockWalletClient, publicClient }) => {
        const config = createConfig(tokenAddress, userAddress);
        const noAccountClient = createMockWalletClient(false);
        const noAccountSigner = new ViemSigner({ walletClient: noAccountClient, publicClient });
        await expect(noAccountSigner.writeContract(config)).rejects.toThrow(
          "WalletClient has no account",
        );
      },
    );
  });

  describe("readContract", () => {
    vit(
      "delegates to publicClient.readContract",
      async ({ tokenAddress, userAddress, viemSigner, publicClient }) => {
        const config = {
          address: tokenAddress,
          abi: [{ name: "balanceOf" }],
          functionName: "balanceOf",
          args: [userAddress],
        };
        const result = await viemSigner.readContract(config);
        expect(result).toBe("0xresult");
        expect(publicClient.readContract).toHaveBeenCalledWith(config);
      },
    );
  });

  describe("waitForTransactionReceipt", () => {
    vit(
      "delegates to publicClient.waitForTransactionReceipt",
      async ({ viemSigner, publicClient }) => {
        const receipt = await viemSigner.waitForTransactionReceipt(TX_HASH);
        expect(receipt).toEqual({ logs: [] });
        expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({
          hash: TX_HASH,
        });
      },
    );
  });

  describe("getBlockTimestamp", () => {
    vit(
      "returns block timestamp from publicClient.getBlock",
      async ({ viemSigner, publicClient }) => {
        const timestamp = await viemSigner.getBlockTimestamp();
        expect(timestamp).toBe(1700000000n);
        expect(publicClient.getBlock).toHaveBeenCalled();
      },
    );
  });
});

describe("ViemSigner read-only mode (no walletClient)", () => {
  vit(
    "readContract works without walletClient",
    async ({ tokenAddress, userAddress, publicClient }) => {
      const readOnlySigner = new ViemSigner({ publicClient });
      const config = {
        address: tokenAddress,
        abi: [{ name: "balanceOf" }],
        functionName: "balanceOf",
        args: [userAddress],
      };
      const result = await readOnlySigner.readContract(config);
      expect(result).toBe("0xresult");
      expect(publicClient.readContract).toHaveBeenCalledWith(config);
    },
  );

  vit("getChainId works without walletClient", async ({ publicClient }) => {
    const readOnlySigner = new ViemSigner({ publicClient });
    const chainId = await readOnlySigner.getChainId();
    expect(chainId).toBe(1);
  });

  vit("waitForTransactionReceipt works without walletClient", async ({ publicClient }) => {
    const readOnlySigner = new ViemSigner({ publicClient });
    const receipt = await readOnlySigner.waitForTransactionReceipt(TX_HASH);
    expect(receipt).toEqual({ logs: [] });
  });

  vit("getAddress throws without walletClient", async ({ publicClient }) => {
    const readOnlySigner = new ViemSigner({ publicClient });
    await expect(readOnlySigner.getAddress()).rejects.toThrow("No walletClient configured");
  });

  vit("signTypedData throws without walletClient", async ({ tokenAddress, publicClient }) => {
    const readOnlySigner = new ViemSigner({ publicClient });
    const typedData: EIP712TypedData = {
      domain: { name: "Test", version: "1", chainId: 1, verifyingContract: tokenAddress },
      types: { Transfer: [{ name: "to", type: "address" }] },
      message: {
        publicKey: "0xkey",
        contractAddresses: ["0x1" as Address],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    };
    await expect(readOnlySigner.signTypedData(typedData)).rejects.toThrow(
      "No walletClient configured",
    );
  });

  vit(
    "writeContract throws without walletClient",
    async ({ tokenAddress, userAddress, publicClient }) => {
      const readOnlySigner = new ViemSigner({ publicClient });
      const config = {
        address: tokenAddress,
        abi: [{ name: "transfer" }],
        functionName: "transfer",
        args: [userAddress, 100n],
      };
      await expect(readOnlySigner.writeContract(config)).rejects.toThrow(
        "No walletClient configured",
      );
    },
  );

  vit("subscribe returns no-op without walletClient", ({ publicClient }) => {
    const readOnlySigner = new ViemSigner({ publicClient });
    const unsub = readOnlySigner.subscribe({ onDisconnect: vi.fn(), onAccountChange: vi.fn() });
    expect(typeof unsub).toBe("function");
    unsub(); // should not throw
  });
});

// ── Read contract helpers ────────────────────────────────

describe("Viem read contract helpers", () => {
  vit(
    "readConfidentialBalanceOfContract calls readContract with correct config",
    ({ tokenAddress, userAddress, publicClient }) => {
      readConfidentialBalanceOfContract(publicClient, tokenAddress, userAddress);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: tokenAddress,
          functionName: "confidentialBalanceOf",
          args: [userAddress],
        }),
      );
    },
  );

  vit(
    "readWrapperForTokenContract calls readContract with correct config",
    ({ tokenAddress, publicClient }) => {
      readWrapperForTokenContract(publicClient, COORDINATOR, tokenAddress);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: COORDINATOR,
          functionName: "getWrapper",
          args: [tokenAddress],
        }),
      );
    },
  );

  vit(
    "readUnderlyingTokenContract calls readContract with correct config",
    ({ wrapperAddress, publicClient }) => {
      readUnderlyingTokenContract(publicClient, wrapperAddress);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: wrapperAddress,
          functionName: "underlying",
        }),
      );
    },
  );

  vit(
    "readWrapperExistsContract calls readContract with correct config",
    ({ tokenAddress, publicClient }) => {
      readWrapperExistsContract(publicClient, COORDINATOR, tokenAddress);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: COORDINATOR,
          functionName: "wrapperExists",
          args: [tokenAddress],
        }),
      );
    },
  );

  vit(
    "readSupportsInterfaceContract calls readContract with correct config",
    ({ tokenAddress, publicClient }) => {
      const interfaceId = "0x12345678" as Address;
      readSupportsInterfaceContract(publicClient, tokenAddress, interfaceId);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: tokenAddress,
          functionName: "supportsInterface",
          args: [interfaceId],
        }),
      );
    },
  );
});

// ── Write contract helpers ───────────────────────────────

describe("Viem write contract helpers", () => {
  describe("requireAccount behavior", () => {
    vit(
      "throws when wallet client has no account",
      ({ tokenAddress, userAddress, createMockWalletClient }) => {
        const noAccountClient = createMockWalletClient(false);
        expect(() =>
          writeConfidentialTransferContract(
            noAccountClient,
            tokenAddress,
            userAddress,
            new Uint8Array([1]),
            new Uint8Array([2]),
          ),
        ).toThrow("WalletClient has no account");
      },
    );
  });

  vit(
    "writeConfidentialTransferContract calls writeContract with correct config",
    ({ tokenAddress, userAddress, walletClient }) => {
      const handle = new Uint8Array([0xab, 0xcd]);
      const proof = new Uint8Array([0xef]);
      writeConfidentialTransferContract(walletClient, tokenAddress, userAddress, handle, proof);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: tokenAddress,
          functionName: "confidentialTransfer",
          args: [userAddress, "0xabcd", "0xef"],
        }),
      );
    },
  );

  vit(
    "writeConfidentialBatchTransferContract calls writeContract with correct config",
    ({ tokenAddress, userAddress, walletClient }) => {
      const batchData = [
        {
          to: userAddress,
          encryptedAmount: "0xhandle" as Address,
          inputProof: "0xproof" as Address,
          retryFor: 0n,
        },
      ];
      writeConfidentialBatchTransferContract(
        walletClient,
        BATCHER,
        tokenAddress,
        userAddress,
        batchData,
        10n,
      );
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: BATCHER,
          functionName: "confidentialBatchTransfer",
          args: [tokenAddress, userAddress, batchData],
          value: 10n,
        }),
      );
    },
  );

  vit(
    "writeUnwrapContract calls writeContract with correct config",
    ({ tokenAddress, userAddress, walletClient }) => {
      const handle = new Uint8Array([0xde, 0xad]);
      const proof = new Uint8Array([0xbe, 0xef]);
      writeUnwrapContract(walletClient, tokenAddress, userAddress, SPENDER, handle, proof);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: tokenAddress,
          functionName: "unwrap",
          args: [userAddress, SPENDER, "0xdead", "0xbeef"],
        }),
      );
    },
  );

  vit(
    "writeUnwrapFromBalanceContract calls writeContract with correct config",
    ({ tokenAddress, userAddress, walletClient }) => {
      const encryptedBalance = "0xbalance" as Address;
      writeUnwrapFromBalanceContract(
        walletClient,
        tokenAddress,
        userAddress,
        SPENDER,
        encryptedBalance,
      );
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: tokenAddress,
          functionName: "unwrap",
          args: [userAddress, SPENDER, encryptedBalance],
        }),
      );
    },
  );

  vit(
    "writeFinalizeUnwrapContract calls writeContract with correct config",
    ({ wrapperAddress, walletClient }) => {
      const burntAmount = "0xburnt" as Address;
      const proof = "0xproof" as Address;
      writeFinalizeUnwrapContract(walletClient, wrapperAddress, burntAmount, 500n, proof);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: wrapperAddress,
          functionName: "finalizeUnwrap",
          args: [burntAmount, 500n, proof],
        }),
      );
    },
  );

  vit(
    "writeSetOperatorContract calls writeContract with correct config",
    ({ tokenAddress, walletClient }) => {
      writeSetOperatorContract(walletClient, tokenAddress, SPENDER, 12345);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: tokenAddress,
          functionName: "setOperator",
          args: [SPENDER, 12345],
        }),
      );
    },
  );

  vit(
    "writeSetOperatorContract uses default timestamp when not provided",
    ({ tokenAddress, walletClient }) => {
      const before = Math.floor(Date.now() / 1000) + 3600;
      writeSetOperatorContract(walletClient, tokenAddress, SPENDER);
      const after = Math.floor(Date.now() / 1000) + 3600;

      const callArgs = (walletClient.writeContract as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const timestamp = callArgs.args[1] as number;
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    },
  );

  vit(
    "writeWrapContract calls writeContract with correct config",
    ({ wrapperAddress, userAddress, walletClient }) => {
      writeWrapContract(walletClient, wrapperAddress, userAddress, 1000n);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: wrapperAddress,
          functionName: "wrap",
          args: [userAddress, 1000n],
        }),
      );
    },
  );

  vit(
    "writeWrapETHContract calls writeContract with correct config and value",
    ({ wrapperAddress, userAddress, walletClient }) => {
      writeWrapETHContract(walletClient, wrapperAddress, userAddress, 500n, 500n);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: wrapperAddress,
          functionName: "wrapETH",
          args: [userAddress, 500n],
          value: 500n,
        }),
      );
    },
  );

  describe("all write helpers throw without account", () => {
    vit(
      "writeConfidentialBatchTransferContract",
      ({ tokenAddress, userAddress, createMockWalletClient }) => {
        const noAccountClient = createMockWalletClient(false);
        expect(() =>
          writeConfidentialBatchTransferContract(
            noAccountClient,
            BATCHER,
            tokenAddress,
            userAddress,
            [],
            0n,
          ),
        ).toThrow("WalletClient has no account");
      },
    );

    vit("writeUnwrapContract", ({ tokenAddress, userAddress, createMockWalletClient }) => {
      const noAccountClient = createMockWalletClient(false);
      expect(() =>
        writeUnwrapContract(
          noAccountClient,
          tokenAddress,
          userAddress,
          SPENDER,
          new Uint8Array(),
          new Uint8Array(),
        ),
      ).toThrow("WalletClient has no account");
    });

    vit(
      "writeUnwrapFromBalanceContract",
      ({ tokenAddress, userAddress, createMockWalletClient }) => {
        const noAccountClient = createMockWalletClient(false);
        expect(() =>
          writeUnwrapFromBalanceContract(
            noAccountClient,
            tokenAddress,
            userAddress,
            SPENDER,
            "0x0" as Address,
          ),
        ).toThrow("WalletClient has no account");
      },
    );

    vit("writeFinalizeUnwrapContract", ({ wrapperAddress, createMockWalletClient }) => {
      const noAccountClient = createMockWalletClient(false);
      expect(() =>
        writeFinalizeUnwrapContract(
          noAccountClient,
          wrapperAddress,
          "0x0" as Address,
          0n,
          "0x0" as Address,
        ),
      ).toThrow("WalletClient has no account");
    });

    vit("writeSetOperatorContract", ({ tokenAddress, createMockWalletClient }) => {
      const noAccountClient = createMockWalletClient(false);
      expect(() => writeSetOperatorContract(noAccountClient, tokenAddress, SPENDER)).toThrow(
        "WalletClient has no account",
      );
    });

    vit("writeWrapContract", ({ wrapperAddress, userAddress, createMockWalletClient }) => {
      const noAccountClient = createMockWalletClient(false);
      expect(() => writeWrapContract(noAccountClient, wrapperAddress, userAddress, 0n)).toThrow(
        "WalletClient has no account",
      );
    });

    vit("writeWrapETHContract", ({ wrapperAddress, userAddress, createMockWalletClient }) => {
      const noAccountClient = createMockWalletClient(false);
      expect(() =>
        writeWrapETHContract(noAccountClient, wrapperAddress, userAddress, 0n, 0n),
      ).toThrow("WalletClient has no account");
    });
  });
});
