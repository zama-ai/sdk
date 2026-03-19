/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, type BrowserContext } from "@playwright/test";
import { hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import type { Address } from "viem";
import {
  createTestClient,
  erc20Abi,
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
import { mockRelayerSdk } from "./fhevm";

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
  computeFee: typeof computeFee;
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
  computeFee: async ({}, use) => use(computeFee),
  readErc20Balance: async ({ viemClient, account }, use) => {
    function readErc20Balance(tokenAddress: `0x${string}`, owner: `0x${string}` = account.address) {
      return viemClient.readContract({
        address: tokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
      });
    }
    await use(readErc20Balance);
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
  page: async ({ page, baseURL, privateKey, account, viemClient, contracts, anvilPort }, use) => {
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

    await mockRelayerSdk({
      page,
      baseURL,
      rpcURL: `http://127.0.0.1:${anvilPort}`,
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
