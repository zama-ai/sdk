/* eslint-disable no-empty-pattern */
import { encodeFunctionData, getAddress, parseTransaction } from "viem";
import type { PublicClient, WalletClient, Address, Hex } from "viem";
import type { EIP712TypedData } from "../../relayer/types";
import { test as base, describe, expect, vi } from "../../test-fixtures";

import {
  readConfidentialBalanceOfContract,
  readSupportsInterfaceContract,
  readUnderlyingTokenContract,
  writeConfidentialTransferContract,
  writeFinalizeUnwrapContract,
  writeSetOperatorContract,
  writeUnwrapContract,
  writeUnwrapFromBalanceContract,
  writeWrapContract,
} from "../contracts";
import { ViemSigner } from "../viem-signer";
import { ViemProvider } from "../viem-provider";

// ── Constants ────────────────────────────────────────────

const ACCOUNT_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
const SECOND_ACCOUNT_ADDRESS = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
const SPENDER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;
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
          getChainId: vi.fn().mockResolvedValue(1),
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
  viemSigner: async ({ walletClient }, use) => {
    await use(new ViemSigner({ walletClient }));
  },
});

// Re-alias it for viem-specific tests
const vit = viemTest;

function createFakeEthereum() {
  const listeners = new Map<string, Set<(...args: never[]) => void>>();
  const removeListener = vi.fn((event: string, fn: (...args: never[]) => void) => {
    listeners.get(event)?.delete(fn);
  });
  return {
    request: vi.fn(),
    on(event: string, fn: (...args: never[]) => void) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(fn);
    },
    removeListener,
    emit(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) {
        (fn as (...a: unknown[]) => void)(...args);
      }
    },
  };
}

// ── ViemSigner ───────────────────────────────────────────

describe("ViemSigner", () => {
  describe("subscribe", () => {
    vit(
      "uses walletClient account and chain as initial wallet account",
      async ({ walletClient }) => {
        const ethereum = createFakeEthereum();
        const viemSigner = new ViemSigner({ walletClient, ethereum: ethereum as never });
        const onWalletAccountChange = vi.fn();

        viemSigner.walletAccount.subscribe(onWalletAccountChange);
        await Promise.resolve();
        await Promise.resolve();
        ethereum.emit("accountsChanged", [SECOND_ACCOUNT_ADDRESS]);

        expect(onWalletAccountChange).toHaveBeenCalledTimes(2);
        expect(onWalletAccountChange).toHaveBeenLastCalledWith({
          previous: { address: ACCOUNT_ADDRESS, chainId: 1 },
          next: { address: SECOND_ACCOUNT_ADDRESS, chainId: 1 },
        });
        expect(ethereum.request).not.toHaveBeenCalled();
      },
    );

    vit("dispose removes EIP-1193 listeners once", async ({ walletClient }) => {
      const ethereum = createFakeEthereum();
      const viemSigner = new ViemSigner({ walletClient, ethereum: ethereum as never });

      viemSigner.dispose();
      viemSigner.dispose();

      expect(ethereum.removeListener).toHaveBeenCalledTimes(3);
      expect(ethereum.removeListener).toHaveBeenCalledWith("accountsChanged", expect.any(Function));
      expect(ethereum.removeListener).toHaveBeenCalledWith("disconnect", expect.any(Function));
      expect(ethereum.removeListener).toHaveBeenCalledWith("chainChanged", expect.any(Function));
    });
  });

  describe("walletAccount", () => {
    vit("returns the wallet account address", async ({ viemSigner }) => {
      expect(viemSigner.walletAccount.getSnapshot()).toEqual({
        address: ACCOUNT_ADDRESS,
        chainId: 1,
      });
    });

    vit("throws when wallet client has no account", async ({ createMockWalletClient }) => {
      const noAccountClient = createMockWalletClient(false);
      const noAccountSigner = new ViemSigner({ walletClient: noAccountClient });
      expect(noAccountSigner.walletAccount.getSnapshot()).toBeUndefined();
      expect(() => noAccountSigner.requireWalletAccount("test")).toThrow(
        "Cannot test without a connected wallet account.",
      );
    });
  });

  describe("signTypedData", () => {
    function createTypedData(tokenAddress: Address): EIP712TypedData {
      return {
        domain: { name: "Decryption", version: "1", chainId: 1n, verifyingContract: tokenAddress },
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
          publicKey: "0xkey",
          contractAddresses: ["0x1" as Address],
          startTimestamp: "1000",
          durationDays: "1",
          extraData: "0x",
        },
      } as unknown as EIP712TypedData;
    }

    vit(
      "delegates to walletClient.signTypedData with account and primaryType",
      async ({ tokenAddress, viemSigner, walletClient }) => {
        const typedData = createTypedData(tokenAddress);
        const result = await viemSigner.signTypedData(typedData);
        expect(result).toBe("0xsignature");
        expect(walletClient.signTypedData).toHaveBeenCalledWith({
          account: walletClient.account,
          primaryType: "UserDecryptRequestVerification",
          types: {
            UserDecryptRequestVerification: (
              typedData.types as { UserDecryptRequestVerification: unknown }
            ).UserDecryptRequestVerification,
          },
          domain: typedData.domain,
          message: { ...typedData.message, startTimestamp: 1000n, durationDays: 1n },
        });
      },
    );

    vit(
      "throws when wallet client has no account",
      async ({ tokenAddress, createMockWalletClient }) => {
        const typedData = createTypedData(tokenAddress);
        const noAccountClient = createMockWalletClient(false);
        const noAccountSigner = new ViemSigner({ walletClient: noAccountClient });
        await expect(noAccountSigner.signTypedData(typedData)).rejects.toThrow(
          "Cannot signTypedData without a connected wallet account.",
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
      async ({ tokenAddress, userAddress, createMockWalletClient }) => {
        const config = createConfig(tokenAddress, userAddress);
        const noAccountClient = createMockWalletClient(false);
        const noAccountSigner = new ViemSigner({ walletClient: noAccountClient });
        await expect(noAccountSigner.writeContract(config)).rejects.toThrow(
          "Cannot writeContract without a connected wallet account.",
        );
      },
    );
  });
});

// ── ViemProvider ─────────────────────────────────────────

describe("ViemProvider", () => {
  describe("getChainId", () => {
    vit("delegates to publicClient.getChainId", async ({ publicClient }) => {
      const viemProvider = new ViemProvider({ publicClient });
      const chainId = await viemProvider.getChainId();
      expect(chainId).toBe(1);
      expect(publicClient.getChainId).toHaveBeenCalledOnce();
    });
  });

  describe("readContract", () => {
    vit(
      "delegates to publicClient.readContract",
      async ({ tokenAddress, userAddress, publicClient }) => {
        const viemProvider = new ViemProvider({ publicClient });
        const config = {
          address: tokenAddress,
          abi: [{ name: "balanceOf" }],
          functionName: "balanceOf",
          args: [userAddress],
        };
        const result = await viemProvider.readContract(config);
        expect(result).toBe("0xresult");
        expect(publicClient.readContract).toHaveBeenCalledWith(config);
      },
    );
  });

  describe("waitForTransactionReceipt", () => {
    vit("delegates to publicClient.waitForTransactionReceipt", async ({ publicClient }) => {
      const viemProvider = new ViemProvider({ publicClient });
      const receipt = await viemProvider.waitForTransactionReceipt(TX_HASH);
      expect(receipt).toEqual({ logs: [] });
      expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
    });
  });

  describe("getBlockTimestamp", () => {
    vit("returns block timestamp from publicClient.getBlock", async ({ publicClient }) => {
      const viemProvider = new ViemProvider({ publicClient });
      const timestamp = await viemProvider.getBlockTimestamp();
      expect(timestamp).toBe(1700000000n);
      expect(publicClient.getBlock).toHaveBeenCalled();
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

    // Chain-state values the mocked client reports, asserted against below so
    // the test proves each field flows through the serializer rather than
    // matching a re-typed literal. The pinned overrides are deliberately
    // distinct from the estimates so "override wins over estimate" is visible.
    const CHAIN_ID = 1;
    const NONCE = 7;
    const GAS = 21_000n;
    const ESTIMATED_MAX_FEE = 100n;
    const ESTIMATED_MAX_PRIORITY = 1n;
    const OVERRIDE_MAX_FEE = 500n;
    const OVERRIDE_MAX_PRIORITY = 2n;
    const TX_VALUE = 123n;

    function buildPublicClient(overrides: Partial<PublicClient> = {}): PublicClient {
      return {
        getChainId: vi.fn().mockResolvedValue(CHAIN_ID),
        getTransactionCount: vi.fn().mockResolvedValue(NONCE),
        estimateGas: vi.fn().mockResolvedValue(GAS),
        estimateFeesPerGas: vi
          .fn()
          .mockResolvedValue({
            maxFeePerGas: ESTIMATED_MAX_FEE,
            maxPriorityFeePerGas: ESTIMATED_MAX_PRIORITY,
          }),
        ...overrides,
      } as unknown as PublicClient;
    }

    vit(
      "reads the nonce with the pending block tag for queue-aware sequencing",
      async ({ tokenAddress, userAddress }) => {
        const publicClient = buildPublicClient();
        const provider = new ViemProvider({ publicClient });

        await provider.prepareTransaction({
          from: userAddress,
          calldata: {
            address: tokenAddress,
            abi: balanceOfAbi,
            functionName: "balanceOf",
            args: [userAddress],
          },
        });

        expect(publicClient.getTransactionCount).toHaveBeenCalledWith({
          address: userAddress,
          blockTag: "pending",
        });
      },
    );

    vit(
      "skips getTransactionCount entirely when caller pins the nonce",
      async ({ tokenAddress, userAddress }) => {
        const publicClient = buildPublicClient();
        const provider = new ViemProvider({ publicClient });

        await provider.prepareTransaction({
          from: userAddress,
          calldata: {
            address: tokenAddress,
            abi: balanceOfAbi,
            functionName: "balanceOf",
            args: [userAddress],
          },
          nonce: 42,
        });

        expect(publicClient.getTransactionCount).not.toHaveBeenCalled();
      },
    );

    vit(
      "serializes an EIP-1559 tx whose decoded fields match chain state + overrides",
      async ({ tokenAddress, userAddress }) => {
        const publicClient = buildPublicClient();
        const provider = new ViemProvider({ publicClient });

        const unsignedTx = await provider.prepareTransaction({
          from: userAddress,
          calldata: {
            address: tokenAddress,
            abi: balanceOfAbi,
            functionName: "balanceOf",
            args: [userAddress],
            value: TX_VALUE,
          },
          fees: { maxFeePerGas: OVERRIDE_MAX_FEE, maxPriorityFeePerGas: OVERRIDE_MAX_PRIORITY },
        });

        const decoded = parseTransaction(unsignedTx);
        expect(decoded.type).toBe("eip1559");
        expect(decoded.chainId).toBe(CHAIN_ID); // from getChainId
        expect(decoded.nonce).toBe(NONCE); // from getTransactionCount
        expect(getAddress(decoded.to!)).toBe(getAddress(tokenAddress));
        expect(decoded.value).toBe(TX_VALUE); // from calldata.value
        expect(decoded.gas).toBe(GAS); // from estimateGas
        expect(decoded.maxFeePerGas).toBe(OVERRIDE_MAX_FEE); // pinned override wins over estimate
        expect(decoded.maxPriorityFeePerGas).toBe(OVERRIDE_MAX_PRIORITY);
        expect(decoded.data).toBe(
          encodeFunctionData({ abi: balanceOfAbi, functionName: "balanceOf", args: [userAddress] }),
        );
      },
    );
    // A partial fee pair is unrepresentable — both legs live in the one `fees`
    // object, so a caller passes both or neither. The one runtime case a JS
    // caller can still get wrong is a non-bigint leg, which the guard rejects.
    vit("rejects a non-bigint fee leg at runtime", async ({ tokenAddress, userAddress }) => {
      const publicClient = buildPublicClient();
      const provider = new ViemProvider({ publicClient });

      await expect(
        provider.prepareTransaction({
          from: userAddress,
          calldata: {
            address: tokenAddress,
            abi: balanceOfAbi,
            functionName: "balanceOf",
            args: [userAddress],
          },
          // @ts-expect-error — a JS caller could pass a number; the guard must reject it.
          fees: { maxFeePerGas: 500, maxPriorityFeePerGas: OVERRIDE_MAX_PRIORITY },
        }),
      ).rejects.toThrow(/fees\.maxFeePerGas must be a bigint/);
    });
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
    "readUnderlyingTokenContract calls readContract with correct config",
    ({ wrapperAddress, publicClient }) => {
      readUnderlyingTokenContract(publicClient, wrapperAddress);
      expect(publicClient.readContract).toHaveBeenCalledWith(
        expect.objectContaining({ address: wrapperAddress, functionName: "underlying" }),
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
            new Uint8Array([1]) as unknown as Hex,
            new Uint8Array([2]) as unknown as Hex,
          ),
        ).toThrow("WalletClient has no account");
      },
    );
  });

  vit(
    "writeConfidentialTransferContract calls writeContract with correct config",
    ({ tokenAddress, userAddress, walletClient }) => {
      writeConfidentialTransferContract(walletClient, tokenAddress, userAddress, "0xabcd", "0xef");
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
    "writeUnwrapContract calls writeContract with correct config",
    ({ tokenAddress, userAddress, walletClient }) => {
      writeUnwrapContract(walletClient, tokenAddress, userAddress, SPENDER, "0xdead", "0xbeef");
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
      const unwrapRequestId = "0xburnt" as Address;
      const proof = "0xproof" as Address;
      writeFinalizeUnwrapContract(walletClient, wrapperAddress, unwrapRequestId, 500n, proof);
      expect(walletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          chain: MOCK_CHAIN,
          account: walletClient.account,
          address: wrapperAddress,
          functionName: "finalizeUnwrap",
          args: [unwrapRequestId, 500n, proof],
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

  describe("all write helpers throw without account", () => {
    vit("writeUnwrapContract", ({ tokenAddress, userAddress, createMockWalletClient }) => {
      const noAccountClient = createMockWalletClient(false);
      expect(() =>
        writeUnwrapContract(
          noAccountClient,
          tokenAddress,
          userAddress,
          SPENDER,
          new Uint8Array() as unknown as Hex,
          new Uint8Array() as unknown as Hex,
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
  });
});
