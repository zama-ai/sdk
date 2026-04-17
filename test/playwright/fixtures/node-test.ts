/**
 * Playwright fixtures for Node.js SDK transport-layer tests (no browser).
 *
 * Tests RelayerNode pool lifecycle, chain switching, and concurrency.
 * Domain-level FHE scenarios are covered by the browser e2e suite.
 */
import { test as base } from "@playwright/test";
import {
  HardhatConfig,
  MemoryStorage,
  ZamaSDK,
  type Address,
  type FhevmInstanceConfig,
} from "@zama-fhe/sdk";
import { hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { RelayerNode } from "@zama-fhe/sdk/node";
import { ViemProvider, ViemSigner } from "@zama-fhe/sdk/viem";
import { createPublicClient, createTestClient, http, publicActions, walletActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import deployments from "../../../contracts/deployments.json" with { type: "json" };
import { NODE_ANVIL_PORT, TEST_PRIVATE_KEY } from "./constants";

const privateKey = TEST_PRIVATE_KEY;
const account = privateKeyToAccount(privateKey);

const contracts = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  USDC: deployments.erc20 as Address,
  cUSDC: deployments.cToken as Address,
  acl: hardhatCleartextConfig.aclContractAddress as Address,
} as const;

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

export interface NodeWorkerFixtures {
  anvilPort: number;
  viemClient: ViemClient;
}

export interface NodeTestFixtures {
  account: typeof account;
  contracts: typeof contracts;
  transport: FhevmInstanceConfig;
  relayer: RelayerNode;
  sdk: ZamaSDK;
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
  transport: async ({ anvilPort }, use) => {
    const network = `http://127.0.0.1:${anvilPort}`;
    await use({ ...HardhatConfig, network, relayerUrl: network });
  },
  relayer: async ({ transport }, use) => {
    const relayer = new RelayerNode({
      getChainId: async () => HardhatConfig.chainId,
      transports: {
        [HardhatConfig.chainId]: transport,
      },
      poolSize: 1,
    });
    await use(relayer);
    // Lifecycle owned by the sdk fixture via sdk.terminate() → relayer.terminate().
    // Explicit terminate here as a safety net for tests that use relayer directly.
    relayer.terminate();
  },
  sdk: async ({ viemClient, transport, relayer }, use) => {
    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(transport.network as string),
    });
    const signer = new ViemSigner({ walletClient: viemClient });
    const provider = new ViemProvider({ publicClient });
    const storage = new MemoryStorage();
    using sdk = new ZamaSDK({ relayer, provider, signer, storage });
    await use(sdk);
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
