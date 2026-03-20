/**
 * Playwright fixtures for Node.js SDK tests (no browser required).
 *
 * Uses RelayerNode backed by a mock relayer HTTP server (started as a
 * webServer in playwright.node.config.ts) that implements the relayer V2
 * async API, delegating FHE operations to RelayerCleartext against anvil.
 */
import { test as base } from "@playwright/test";
import type { Address } from "viem";
import { createPublicClient, createTestClient, http, publicActions, walletActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { TEST_PRIVATE_KEY, NODE_ANVIL_PORT } from "./constants";
import deployments from "../../../contracts/deployments.json" with { type: "json" };
import { hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { MemoryStorage, ZamaSDK, HardhatConfig } from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";

const privateKey = TEST_PRIVATE_KEY;
const account = privateKeyToAccount(privateKey);

const contracts = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  USDC: deployments.erc20 as Address,
  cUSDC: deployments.cToken as Address,
  transferBatcher: deployments.transferBatcher as Address,
  feeManager: deployments.feeManager as Address,
  acl: hardhatCleartextConfig.aclContractAddress as Address,
} as const;

const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function createViemClient(port: number) {
  return createTestClient({
    account,
    chain: foundry,
    mode: "anvil",
    transport: http(`http://127.0.0.1:${port}`),
  })
    .extend(walletActions)
    .extend(publicActions);
}

type ViemClient = ReturnType<typeof createViemClient>;

/** Fee: ceiling division of (amount * 100) / 10000 — matches FeeManager.sol */
function computeFee(amount: bigint): bigint {
  return (amount * 100n + 9999n) / 10000n;
}

export interface NodeWorkerFixtures {
  anvilPort: number;
  viemClient: ViemClient;
}

/** Initial balances from Deploy.s.sol (10,000 ERC-20 minted, 1,000 wrapped confidential). */
export interface InitialBalances {
  /** Confidential balance for cUSDT (after deploy wrap fee). */
  cUSDT: bigint;
  /** Confidential balance for cUSDC (after deploy wrap fee). */
  cUSDC: bigint;
  /** ERC-20 balance for USDT. */
  USDT: bigint;
  /** ERC-20 balance for USDC. */
  USDC: bigint;
}

export interface NodeTestFixtures {
  account: typeof account;
  contracts: typeof contracts;
  computeFee: typeof computeFee;
  relayer: RelayerNode;
  sdk: ZamaSDK;
  readErc20Balance: (tokenAddress: Address, owner?: Address) => Promise<bigint>;
  /** Pre-deployed confidential balances (requires allow → balanceOf). */
  initialBalances: InitialBalances;
  anvilState: undefined;
}

export const nodeTest = base.extend<NodeTestFixtures, NodeWorkerFixtures>({
  anvilPort: [NODE_ANVIL_PORT, { option: true, scope: "worker" }],
  viemClient: [
    async ({ anvilPort }, use) => {
      await use(createViemClient(anvilPort));
    },
    { scope: "worker" },
  ],
  account,
  contracts,
  computeFee: async ({}, use) => use(computeFee),
  readErc20Balance: async ({ viemClient, account }, use) => {
    await use((tokenAddress: Address, owner: Address = account.address) =>
      viemClient.readContract({
        address: tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf",
        args: [owner],
      }),
    );
  },
  relayer: async ({ anvilPort }, use) => {
    const relayer = new RelayerNode({
      getChainId: async () => HardhatConfig.chainId,
      transports: {
        [HardhatConfig.chainId]: {
          ...HardhatConfig,
          network: `http://127.0.0.1:${anvilPort}`,
        },
      },
      poolSize: 1,
    });
    await use(relayer);
    relayer.terminate();
  },
  sdk: async ({ viemClient, anvilPort, relayer }, use) => {
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(`http://127.0.0.1:${anvilPort}`),
    });
    const signer = new ViemSigner({ walletClient: viemClient, publicClient });
    const storage = new MemoryStorage();
    const sdk = new ZamaSDK({ relayer, signer, storage });
    await use(sdk);
    sdk.terminate();
  },
  // Depend on anvilState so the snapshot is taken before allow() mutates chain state.
  initialBalances: async ({ sdk, contracts, readErc20Balance, anvilState }, use) => {
    void anvilState;
    await sdk.allow(contracts.cUSDT as Address, contracts.cUSDC as Address);
    const readUSDT = sdk.createReadonlyToken(contracts.cUSDT as Address);
    const readUSDC = sdk.createReadonlyToken(contracts.cUSDC as Address);
    const [cUSDT, cUSDC, USDT, USDC] = await Promise.all([
      readUSDT.balanceOf(),
      readUSDC.balanceOf(),
      readErc20Balance(contracts.USDT),
      readErc20Balance(contracts.USDC),
    ]);
    await use({ cUSDT, cUSDC, USDT, USDC });
  },
  // Auto-use fixture: snapshot anvil before each test, revert after.
  anvilState: [
    async ({ viemClient }, use) => {
      const id = await viemClient.snapshot();
      await use(undefined);
      try {
        await viemClient.revert({ id });
      } catch (cause) {
        throw new Error(
          `Anvil snapshot revert failed (id=${id}). Subsequent tests may have stale state.`,
          { cause },
        );
      }
    },
    { auto: true },
  ],
});

export const expect = nodeTest.expect;
