/**
 * Playwright fixtures for Node.js SDK transport-layer tests (no browser).
 *
 * Tests RelayerNode pool lifecycle, chain switching, and concurrency.
 * Domain-level FHE scenarios are covered by the browser e2e suite.
 */
import { test as base } from "@playwright/test";
import type { FheChain } from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
import { anvil } from "@zama-fhe/sdk/chains";
import { node } from "@zama-fhe/sdk/node";
import { createConfig } from "@zama-fhe/sdk/viem";
import type { Address, PublicClient } from "viem";
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
  acl: anvil.aclContractAddress as Address,
};

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
  publicClient: PublicClient;
}

export interface NodeTestFixtures {
  account: typeof account;
  contracts: typeof contracts;
  chain: FheChain;
  sdk: ZamaSDK;
  anvilState: undefined;
}

export const nodeTest = base.extend<NodeTestFixtures, NodeWorkerFixtures>({
  anvilPort: [NODE_ANVIL_PORT, { scope: "worker" }],
  viemClient: [
    async ({ anvilPort }, use) => {
      const client = createViemClient(anvilPort);
      await use(client);
    },
    { scope: "worker" },
  ],
  publicClient: [
    async ({ anvilPort }, use) => {
      await use(
        createPublicClient({
          chain: foundry,
          transport: http(`http://127.0.0.1:${anvilPort}`),
        }),
      );
    },
    { scope: "worker" },
  ],
  account,
  contracts,
  chain: async ({ anvilPort }, use) => {
    const network = `http://127.0.0.1:${anvilPort}`;
    await use({ ...anvil, relayerUrl: network, network });
  },

  sdk: async ({ viemClient, publicClient, chain }, use) => {
    const config = createConfig({
      chains: [chain],
      publicClient,
      walletClient: viemClient,
      transports: { [chain.id]: node() },
    });
    using sdk = new ZamaSDK(config);
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

export { expect } from "@playwright/test";
