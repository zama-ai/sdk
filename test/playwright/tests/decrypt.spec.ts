import { test, expect } from "../fixtures";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const ACCOUNT_1_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

const mintAbi = [
  {
    type: "function" as const,
    name: "mint" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "account", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const erc20ApproveAbi = [
  {
    type: "function" as const,
    name: "approve" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const wrapAbi = [
  {
    type: "function" as const,
    name: "wrap" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const aclDelegateAbi = [
  {
    type: "function" as const,
    name: "delegateForUserDecryption" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "delegate", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "expirationDate", type: "uint64" },
    ],
    outputs: [],
  },
] as const;

function createAccount1Client(port: number) {
  const account1 = privateKeyToAccount(ACCOUNT_1_PK);
  const client = createWalletClient({
    account: account1,
    chain: foundry,
    transport: http(`http://127.0.0.1:${port}`),
  });
  return { account1, client };
}

test("should publicly decrypt the unwrap amount taken from event logs", async ({
  page,
  contracts,
}) => {
  const shieldAmount = 500n;
  const unwrapAmount = 200n;

  // Shield first to guarantee a confidential balance
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/decrypt?token=${contracts.cUSDT}`);

  // The query-based decrypt resolves the connected wallet's own balance handle
  await expect(page.getByTestId("self-decrypt-result")).toHaveText(/Clear value: \d+/);

  // Guard: public decrypt is disabled until the unwrap produces a handle
  await expect(page.getByTestId("public-decrypt-button")).toBeDisabled();

  // Unwrap marks the requested amount publicly decryptable
  await page.getByTestId("amount-input").fill(unwrapAmount.toString());
  await page.getByTestId("unwrap-button").click();
  await expect(page.getByTestId("public-decrypt-button")).toBeEnabled();

  // Decrypt the handle from the UnwrapRequested event log
  await page.getByTestId("public-decrypt-button").click();
  await expect(page.getByTestId("public-decrypt-result")).toHaveText(
    `Clear value: ${unwrapAmount}`,
  );
});

test("should decrypt delegator values and batch balances as delegate", async ({
  page,
  account,
  viemClient,
  contracts,
  anvilPort,
}) => {
  const { client: account1Client, account1 } = createAccount1Client(anvilPort);
  const fundedAmount = 300n;

  // Fund Account #1 with a confidential balance: mint, approve, wrap
  const mintHash = await viemClient.writeContract({
    address: contracts.USDT,
    abi: mintAbi,
    functionName: "mint",
    args: [account1.address, fundedAmount],
  });
  await viemClient.waitForTransactionReceipt({ hash: mintHash });

  const approveHash = await account1Client.writeContract({
    address: contracts.USDT,
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [contracts.cUSDT, fundedAmount],
  });
  await viemClient.waitForTransactionReceipt({ hash: approveHash });

  const wrapHash = await account1Client.writeContract({
    address: contracts.cUSDT,
    abi: wrapAbi,
    functionName: "wrap",
    args: [account1.address, fundedAmount],
  });
  await viemClient.waitForTransactionReceipt({ hash: wrapHash });

  // Account #1 delegates decryption to the connected wallet for both tokens
  for (const tokenAddress of [contracts.cUSDT, contracts.cUSDC]) {
    const delegateHash = await account1Client.writeContract({
      address: contracts.acl,
      abi: aclDelegateAbi,
      functionName: "delegateForUserDecryption",
      args: [account.address, tokenAddress, 2n ** 64n - 1n],
    });
    await viemClient.waitForTransactionReceipt({ hash: delegateHash });
  }

  await page.goto(
    `/decrypt?token=${contracts.cUSDT}&secondToken=${contracts.cUSDC}&delegator=${account1.address}`,
  );

  // Delegated multi-value decrypt of the delegator's raw balance handle
  await page.getByTestId("delegated-decrypt-button").click();
  await expect(page.getByTestId("delegated-decrypt-result")).toHaveText(
    `Clear value: ${fundedAmount}`,
  );

  // Batch delegated decrypt across both tokens in one mutation
  await page.getByTestId("batch-decrypt-button").click();
  const items = page.getByTestId("batch-decrypt-item");
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: new RegExp(contracts.cUSDT, "i") })).toContainText(
    `: ${fundedAmount}`,
  );
  await expect(items.filter({ hasText: new RegExp(contracts.cUSDC, "i") })).toContainText(": 0");
});
