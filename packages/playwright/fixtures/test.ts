/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type BrowserContext } from "@playwright/test";
import { createTestClient, formatUnits, http, publicActions, walletActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { mockRelayerSdk } from "./fhevm";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };
import type { Address } from "viem";

const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

const account = privateKeyToAccount(privateKey);

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

// Hardhat deployment mints 1_000 * 10^6 ERC-20 tokens to the test account per token.
// Shielding (done by alice) deposits 1_000 * 10^6 into each confidential token.
// Net initial confidential balance = shielded - shieldFee(shielded).
// ERC-20 balance is untouched because alice shields with her own tokens.
const MINTED = 1_000n * 10n ** 6n;
const CONFIDENTIAL = MINTED - computeFee(MINTED);

const initialBalances = {
  USDT: MINTED,
  cUSDT: CONFIDENTIAL,
  USDC: MINTED,
  cUSDC: CONFIDENTIAL,
} as const;

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

export interface TestFixtures {
  context: BrowserContext;
  baseURL: `http://${string}` | `https://${string}`;
  privateKey: typeof privateKey;
  account: typeof account;
  viemClient: typeof viemClient;
  contracts: typeof contracts;
  initialBalances: typeof initialBalances;
  formatUnits: typeof formatUnits;
  computeFee: typeof computeFee;
  readErc20Balance: typeof readErc20Balance;
}

export const test = base.extend<TestFixtures>({
  privateKey,
  account,
  viemClient,
  contracts,
  initialBalances,
  formatUnits: async ({}, use) => use(formatUnits),
  computeFee: async ({}, use) => use(computeFee),
  readErc20Balance: async ({}, use) => use(readErc20Balance),
  page: async ({ page, baseURL, privateKey, viemClient }, use) => {
    const id = await viemClient.snapshot();

    await mockRelayerSdk(page, baseURL);

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
