/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type BrowserContext } from "@playwright/test";
import { createTestClient, formatUnits, http, publicActions, walletActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";
import { mockRelayerSdk } from "./fhevm";

const privateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

const account = privateKeyToAccount(privateKey);

const contracts = {
  USDT: "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6",
  cUSDT: "0xBA12646CC07ADBe43F8bD25D83FB628D29C8A762",
  USDC: "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
  cUSDC: "0x3B02fF1e626Ed7a8fd6eC5299e2C54e1421B626B",
  transferBatcher: "0x0DCd1Bf9A1b36cE34237eEaFef220932846BCD82",
  feeManager: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
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
}

export const test = base.extend<TestFixtures>({
  privateKey,
  account,
  viemClient,
  contracts,
  initialBalances,
  formatUnits: async ({}, use) => use(formatUnits),
  computeFee: async ({}, use) => use(computeFee),
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
