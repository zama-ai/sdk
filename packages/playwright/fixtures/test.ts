/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type BrowserContext } from "@playwright/test";
import type { Address } from "viem";
import { createTestClient, formatUnits, http, publicActions, walletActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import deployments from "../../../hardhat/deployments.json" with { type: "json" };

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
  page: async ({ page, privateKey, viemClient }, use) => {
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

    // Wait for in-flight route handlers (userDecrypt/publicDecrypt) to finish
    // before reverting — they mine blocks on the Hardhat node, and concurrent
    // mining + revert causes chain state to leak between tests.
    await page.unrouteAll({ behavior: "wait" });

    await viemClient.revert({ id });
    // Mine blocks so the chain advances past the Hardhat coprocessor's stale
    // BlockLogCursor — evm_revert doesn't reset the coprocessor cursor, so
    // without this it skips blocks where new handles are created in later tests.
    await viemClient.mine({ blocks: 100 });
  },
});

export const expect = test.expect;
