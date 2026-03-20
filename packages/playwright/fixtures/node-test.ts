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
import { TEST_PRIVATE_KEY, MINTED, NODE_ANVIL_PORT } from "./constants";
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

const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

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

export interface NodeTestFixtures {
  account: typeof account;
  contracts: typeof contracts;
  computeFee: typeof computeFee;
  relayer: RelayerNode;
  sdk: ZamaSDK;
  readErc20Balance: (tokenAddress: Address, owner?: Address) => Promise<bigint>;
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
  // Override page fixture — node tests don't use a browser.
  // Mint tokens + snapshot/revert like the browser fixture.
  page: async ({ page, viemClient, account }, use) => {
    const nonce = await viemClient.getTransactionCount({
      address: account.address,
    });
    const usdcHash = await viemClient.writeContract({
      address: contracts.USDC,
      abi: mintAbi,
      functionName: "mint",
      args: [account.address, MINTED],
      nonce,
    });
    const usdtHash = await viemClient.writeContract({
      address: contracts.USDT,
      abi: mintAbi,
      functionName: "mint",
      args: [account.address, MINTED],
      nonce: nonce + 1,
    });
    await Promise.all([
      viemClient.waitForTransactionReceipt({ hash: usdcHash }),
      viemClient.waitForTransactionReceipt({ hash: usdtHash }),
    ]);

    const id = await viemClient.snapshot();

    // Pass null as page — node tests don't use it
    await use(page);

    await viemClient.revert({ id });
  },
});

export const expect = nodeTest.expect;
