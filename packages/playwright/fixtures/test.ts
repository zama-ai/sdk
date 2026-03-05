/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type BrowserContext } from "@playwright/test";
import type { Address } from "viem";
import {
  createTestClient,
  formatUnits,
  http,
  parseUnits,
  publicActions,
  walletActions,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };
import { MINTED, TEST_PRIVATE_KEY } from "./constants";

const account = privateKeyToAccount(TEST_PRIVATE_KEY);

const contracts = {
  USDT: deployments.USDT as Address,
  cUSDT: deployments.cUSDT as Address,
  USDC: deployments.erc20 as Address,
  cUSDC: deployments.cToken as Address,
  transferBatcher: deployments.transferBatcher as Address,
  feeManager: deployments.feeManager as Address,
} as const;

/** Fee: ceiling division of (amount * 100) / 10000 — matches FeeManager.sol */
function computeFee(amount: bigint): bigint {
  return (amount * 100n + 9999n) / 10000n;
}

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

const viemClient = createTestClient({
  account,
  chain: hardhat,
  mode: "hardhat",
  transport: http(),
})
  .extend(walletActions)
  .extend(publicActions);

const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

async function readErc20Balance(
  tokenAddress: `0x${string}`,
  owner: `0x${string}` = account.address,
): Promise<bigint> {
  return viemClient.readContract({
    address: tokenAddress,
    abi: erc20BalanceOfAbi,
    functionName: "balanceOf",
    args: [owner],
  });
}

export interface ConfidentialBalances {
  cUSDT: bigint;
  cUSDC: bigint;
}

export interface TestFixtures {
  context: BrowserContext;
  baseURL: `http://${string}` | `https://${string}`;
  privateKey: typeof TEST_PRIVATE_KEY;
  account: typeof account;
  viemClient: typeof viemClient;
  contracts: typeof contracts;
  formatUnits: typeof formatUnits;
  computeFee: typeof computeFee;
  readErc20Balance: typeof readErc20Balance;
  confidentialBalances: ConfidentialBalances;
}

export const test = base.extend<TestFixtures>({
  privateKey: TEST_PRIVATE_KEY,
  account,
  viemClient,
  contracts,
  formatUnits: async ({}, use) => use(formatUnits),
  computeFee: async ({}, use) => use(computeFee),
  readErc20Balance: async ({}, use) => use(readErc20Balance),
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
  page: async ({ page, baseURL, privateKey, account, viemClient, contracts }, use) => {
    // Mint ERC-20 tokens to the test account before snapshotting, so every test
    // starts from a funded state regardless of what the deploy script did.
    const nonce = await viemClient.getTransactionCount({ address: account.address });
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

    // Inject wallet private key for the burner-connector
    await page.addInitScript((pk) => {
      window.localStorage.setItem("burnerWallet.pk", pk);
    }, privateKey);

    // Navigate to wallet page and ensure wallet is connected
    // (both Next.js and Vite redirect "/" → "/wallet"; navigating directly
    // avoids a server-side 307 in Next.js that Playwright treats as ERR_ABORTED)
    await page.goto("/wallet");
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
