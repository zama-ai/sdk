// oxlint-disable no-empty-pattern
/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type BrowserContext } from "@playwright/test";
import { hardhat } from "@zama-fhe/sdk/chains";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "@zama-fhe/sdk";
import {
  createTestClient,
  formatUnits,
  http,
  parseUnits,
  publicActions,
  walletActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import deployments from "../../../contracts/deployments.json" with { type: "json" };
import { MINTED, NEXTJS_ANVIL_PORT, TEST_PRIVATE_KEY } from "./constants";

const mockCdnBundle = readFileSync(resolve(import.meta.dirname, "relayer-sdk-cdn.mjs"), "utf-8");

const privateKey = TEST_PRIVATE_KEY;

const account = privateKeyToAccount(privateKey);

const contracts = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  USDC: deployments.erc20 as Address,
  cUSDC: deployments.cToken as Address,
  wrappersRegistry: deployments.wrappersRegistry as Address,
  acl: hardhat.aclContractAddress as Address,
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

const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface ConfidentialBalances {
  cUSDT: bigint;
  cUSDC: bigint;
}

export interface WorkerFixtures {
  anvilPort: number;
  viemClient: ViemClient;
}

export interface TestFixtures {
  context: BrowserContext;
  baseURL: `http://${string}` | `https://${string}`;
  privateKey: typeof privateKey;
  account: typeof account;
  contracts: typeof contracts;
  formatUnits: typeof formatUnits;
  readErc20Balance: (tokenAddress: `0x${string}`, owner?: `0x${string}`) => Promise<bigint>;
  confidentialBalances: ConfidentialBalances;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  anvilPort: [NEXTJS_ANVIL_PORT, { option: true, scope: "worker" }],
  viemClient: [
    async ({ anvilPort }, use) => {
      await use(createViemClient(anvilPort));
    },
    { scope: "worker" },
  ],
  privateKey,
  account,
  contracts,
  formatUnits: async ({}, use) => use(formatUnits),
  readErc20Balance: async ({ viemClient, account }, use) => {
    await use((tokenAddress: `0x${string}`, owner: `0x${string}` = account.address) =>
      viemClient.readContract({
        address: tokenAddress,
        abi: erc20BalanceOfAbi,
        functionName: "balanceOf",
        args: [owner],
      }),
    );
  },
  confidentialBalances: async ({ page }, use) => {
    await page.goto("/wallet");
    await page.getByTestId("reveal-button").click();
    const cUSDTRow = page.getByTestId("token-row-cUSDT");
    await expect(cUSDTRow.getByTestId("balance")).toHaveText(/^\d/);
    const cUSDT = parseUnits((await cUSDTRow.getByTestId("balance").textContent())!.trim(), 6);
    const cERC20Row = page.getByTestId("token-row-cERC20");
    await expect(cERC20Row.getByTestId("balance")).toHaveText(/^\d/);
    const cUSDC = parseUnits((await cERC20Row.getByTestId("balance").textContent())!.trim(), 6);
    await use({ cUSDT, cUSDC });
  },
  page: async ({ page, privateKey, account, viemClient, contracts }, use) => {
    // Mint ERC-20 tokens to the test account before snapshotting, so every test
    // starts from a funded state regardless of what the deploy script did.
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

    // Intercept the CDN request for the relayer SDK bundle and serve the mock
    await page.route("**/relayer-sdk-js*", async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: mockCdnBundle,
      });
    });

    // Inject wallet private key for the burner-connector
    await page.addInitScript((pk) => {
      window.localStorage.setItem("burnerWallet.pk", pk);
    }, privateKey);

    // Navigate to home and ensure wallet is connected
    await page.goto("/");
    const connectButton = page.getByRole("button", {
      name: "Connect Wallet",
    });
    const walletAddress = page.getByTestId("wallet-address");

    // Wallet may auto-reconnect from a previous session, or need a manual click
    const connected = await walletAddress
      .waitFor({ state: "visible", timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (!connected) {
      await connectButton.click();
      await walletAddress.waitFor({ state: "visible" });
    }

    await use(page);

    // Wait for in-flight route handlers to finish before reverting.
    await page.unrouteAll({ behavior: "wait" });

    await viemClient.revert({ id });
  },
});

export const expect = test.expect;
