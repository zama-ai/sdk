import { test, expect } from "../fixtures";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { hardhat } from "viem/chains";

const ACCOUNT_1_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ACCOUNT_1 = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

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

const aclRevokeAbi = [
  {
    type: "function" as const,
    name: "revokeDelegationForUserDecryption" as const,
    stateMutability: "nonpayable" as const,
    inputs: [
      { name: "delegate", type: "address" },
      { name: "contractAddress", type: "address" },
    ],
    outputs: [],
  },
] as const;

const aclExpiryAbi = [
  {
    type: "function" as const,
    name: "getUserDecryptionDelegationExpirationDate" as const,
    stateMutability: "view" as const,
    inputs: [
      { name: "delegator", type: "address" },
      { name: "delegate", type: "address" },
      { name: "contractAddress", type: "address" },
    ],
    outputs: [{ name: "", type: "uint64" }],
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

function createAccount1Client() {
  const account1 = privateKeyToAccount(ACCOUNT_1_PK);
  const client = createWalletClient({
    account: account1,
    chain: hardhat,
    transport: http(),
  });
  return { account1, client };
}

/** Mint USDT to Account #1, approve, and wrap into cUSDT. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fundAccount1(
  viemClient: any,
  account1Client: any,
  account1Address: `0x${string}`,
  contracts: { USDT: `0x${string}`; cUSDT: `0x${string}` },
  amount: bigint,
) {
  const mintHash = await viemClient.writeContract({
    address: contracts.USDT,
    abi: mintAbi,
    functionName: "mint",
    args: [account1Address, amount],
  });
  await viemClient.waitForTransactionReceipt({ hash: mintHash });

  const approveHash = await account1Client.writeContract({
    address: contracts.USDT,
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [contracts.cUSDT, amount],
  });
  await viemClient.waitForTransactionReceipt({ hash: approveHash });

  const wrapHash = await account1Client.writeContract({
    address: contracts.cUSDT,
    abi: wrapAbi,
    functionName: "wrap",
    args: [account1Address, amount],
  });
  await viemClient.waitForTransactionReceipt({ hash: wrapHash });
}

test("should delegate decryption to another account", async ({
  page,
  contracts,
  confidentialBalances,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  await page.goto(`/delegation?token=${contracts.cUSDT}&delegate=${ACCOUNT_1}`);

  await page.getByTestId("delegate-button").click();
  await expect(page.getByTestId("delegate-success")).toContainText("Tx: 0x");
});

test("should decrypt zero balance as delegate", async ({
  page,
  account,
  viemClient,
  contracts,
  confidentialBalances,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  // Account #1 (no shielded balance) delegates to Account #0.
  const { client: account1Client, account1 } = createAccount1Client();
  const hash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash });

  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account1.address}`);
  await page.getByTestId("decrypt-delegate-button").click();

  await expect(page.getByTestId("delegated-balance")).toContainText("0");
});

test("should decrypt non-zero balance via full delegation round-trip", async ({
  page,
  account,
  viemClient,
  contracts,
  computeFee,
}) => {
  const { client: account1Client, account1 } = createAccount1Client();
  const shieldAmount = 500_000_000n; // 500 USDT (6 decimals)

  // 1. Mint USDT to Account #1
  const mintHash = await viemClient.writeContract({
    address: contracts.USDT,
    abi: mintAbi,
    functionName: "mint",
    args: [account1.address, shieldAmount],
  });
  await viemClient.waitForTransactionReceipt({ hash: mintHash });

  // 2. Account #1 approves cUSDT wrapper to spend USDT
  const approveHash = await account1Client.writeContract({
    address: contracts.USDT,
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [contracts.cUSDT, shieldAmount],
  });
  await viemClient.waitForTransactionReceipt({ hash: approveHash });

  // 3. Account #1 shields (wraps) USDT → cUSDT
  const wrapHash = await account1Client.writeContract({
    address: contracts.cUSDT,
    abi: wrapAbi,
    functionName: "wrap",
    args: [account1.address, shieldAmount],
  });
  await viemClient.waitForTransactionReceipt({ hash: wrapHash });

  // 4. Account #1 delegates decryption to Account #0
  const delegateHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash: delegateHash });

  // 5. Account #0 (connected wallet) decrypts Account #1's balance as delegate
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account1.address}`);
  await page.getByTestId("decrypt-delegate-button").click();

  const expectedBalance = shieldAmount - computeFee(shieldAmount);
  await expect(page.getByTestId("delegated-balance")).toContainText(expectedBalance.toString());
});

test("should revoke delegation and reset on-chain expiry to zero", async ({
  account,
  viemClient,
  contracts,
  confidentialBalances,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  const { client: account1Client, account1 } = createAccount1Client();

  // 1. Account #1 delegates decryption to Account #0
  const delegateHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash: delegateHash });

  // Verify delegation is active
  const expiryBefore = await viemClient.readContract({
    address: contracts.acl,
    abi: aclExpiryAbi,
    functionName: "getUserDecryptionDelegationExpirationDate",
    args: [account1.address, account.address, contracts.cUSDT],
  });
  expect(expiryBefore).toBe(2n ** 64n - 1n);

  // 2. Account #1 revokes the delegation (different block from delegation)
  const revokeHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclRevokeAbi,
    functionName: "revokeDelegationForUserDecryption",
    args: [account.address, contracts.cUSDT],
  });
  await viemClient.waitForTransactionReceipt({ hash: revokeHash });

  // 3. Verify expiry is now 0 (revoked)
  const expiryAfter = await viemClient.readContract({
    address: contracts.acl,
    abi: aclExpiryAbi,
    functionName: "getUserDecryptionDelegationExpirationDate",
    args: [account1.address, account.address, contracts.cUSDT],
  });
  expect(expiryAfter).toBe(0n);
});

test("should delegate with custom expiration and store correct on-chain expiry", async ({
  account,
  viemClient,
  contracts,
  confidentialBalances,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  const { client: account1Client, account1 } = createAccount1Client();

  // ACL requires expirationDate >= block.timestamp + 1 hour; use +2h for safety.
  const latestBlock = await viemClient.getBlock();
  const expirationDate = latestBlock.timestamp + 7200n;

  const delegateHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, expirationDate],
  });
  await viemClient.waitForTransactionReceipt({ hash: delegateHash });

  // Verify the expiry was stored correctly
  const storedExpiry = await viemClient.readContract({
    address: contracts.acl,
    abi: aclExpiryAbi,
    functionName: "getUserDecryptionDelegationExpirationDate",
    args: [account1.address, account.address, contracts.cUSDT],
  });
  expect(storedExpiry).toBe(expirationDate);
});

test("should overwrite delegation with a different expiry", async ({
  account,
  viemClient,
  contracts,
  confidentialBalances,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  const { client: account1Client, account1 } = createAccount1Client();

  // 1. Delegate with max expiry
  const hash1 = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash: hash1 });

  // 2. Overwrite with a shorter (but valid, > 1 hour) expiry
  const latestBlock = await viemClient.getBlock();
  const newExpiry = latestBlock.timestamp + 7200n;

  const hash2 = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, newExpiry],
  });
  await viemClient.waitForTransactionReceipt({ hash: hash2 });

  // 3. Verify the expiry was updated
  const storedExpiry = await viemClient.readContract({
    address: contracts.acl,
    abi: aclExpiryAbi,
    functionName: "getUserDecryptionDelegationExpirationDate",
    args: [account1.address, account.address, contracts.cUSDT],
  });
  expect(storedExpiry).toBe(newExpiry);
});

test("should reject delegation with expiry less than one hour", async ({
  account,
  viemClient,
  contracts,
  confidentialBalances,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  const { client: account1Client } = createAccount1Client();

  // ACL enforces expirationDate >= block.timestamp + 1 hour
  const latestBlock = await viemClient.getBlock();
  const tooSoonExpiry = latestBlock.timestamp + 1800n; // 30 minutes

  await expect(
    account1Client.writeContract({
      address: contracts.acl,
      abi: aclDelegateAbi,
      functionName: "delegateForUserDecryption",
      args: [account.address, contracts.cUSDT, tooSoonExpiry],
    }),
  ).rejects.toThrow();
});

test("should reject revocation when no delegation exists", async ({
  account,
  contracts,
  confidentialBalances,
}) => {
  expect(confidentialBalances.cUSDT).toBeGreaterThan(0n);

  const { client: account1Client } = createAccount1Client();

  // Account #1 never delegated, so revocation should revert with NotDelegatedYet
  await expect(
    account1Client.writeContract({
      address: contracts.acl,
      abi: aclRevokeAbi,
      functionName: "revokeDelegationForUserDecryption",
      args: [account.address, contracts.cUSDT],
    }),
  ).rejects.toThrow();
});

test("should fail to decrypt as delegate after revocation", async ({
  page,
  account,
  viemClient,
  contracts,
  computeFee,
}) => {
  const { client: account1Client, account1 } = createAccount1Client();
  const shieldAmount = 500_000_000n;

  // 1. Fund Account #1 with shielded tokens
  await fundAccount1(viemClient, account1Client, account1.address, contracts, shieldAmount);

  // 2. Delegate decryption to Account #0
  const delegateHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash: delegateHash });

  // 3. Verify decrypt works before revocation
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account1.address}`);
  await page.getByTestId("decrypt-delegate-button").click();
  const expectedBalance = shieldAmount - computeFee(shieldAmount);
  await expect(page.getByTestId("delegated-balance")).toContainText(expectedBalance.toString());

  // 4. Revoke the delegation
  const revokeHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclRevokeAbi,
    functionName: "revokeDelegationForUserDecryption",
    args: [account.address, contracts.cUSDT],
  });
  await viemClient.waitForTransactionReceipt({ hash: revokeHash });

  // 5. Reload and try again — should fail
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account1.address}`);
  await page.getByTestId("decrypt-delegate-button").click();

  await expect(page.getByTestId("decrypt-delegate-error")).toBeVisible();
});

test("should fail to decrypt without delegation", async ({ page, viemClient, contracts }) => {
  const { client: account1Client, account1 } = createAccount1Client();
  const shieldAmount = 500_000_000n;

  // Fund Account #1 so it has a non-zero balance handle
  await fundAccount1(viemClient, account1Client, account1.address, contracts, shieldAmount);

  // Account #0 tries to decrypt Account #1's balance without any delegation
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account1.address}`);
  await page.getByTestId("decrypt-delegate-button").click();

  await expect(page.getByTestId("decrypt-delegate-error")).toBeVisible();
});

test("should fail to decrypt after delegation expires via time advance", async ({
  page,
  account,
  viemClient,
  contracts,
}) => {
  const { client: account1Client, account1 } = createAccount1Client();
  const shieldAmount = 500_000_000n;

  // 1. Fund Account #1
  await fundAccount1(viemClient, account1Client, account1.address, contracts, shieldAmount);

  // 2. Delegate with 2-hour expiry
  const latestBlock = await viemClient.getBlock();
  const expirationDate = latestBlock.timestamp + 7200n;

  const delegateHash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT, expirationDate],
  });
  await viemClient.waitForTransactionReceipt({ hash: delegateHash });

  // 3. Advance hardhat time past the expiry (3 hours)
  await viemClient.increaseTime({ seconds: 3 * 3600 });
  await viemClient.mine({ blocks: 1 });

  // 4. Attempt to decrypt — should fail because delegation expired
  await page.goto(`/delegation?token=${contracts.cUSDT}&delegator=${account1.address}`);
  await page.getByTestId("decrypt-delegate-button").click();

  await expect(page.getByTestId("decrypt-delegate-error")).toBeVisible();
});
