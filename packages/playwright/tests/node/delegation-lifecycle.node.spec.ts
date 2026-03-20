/**
 * Journey: Account #0 shields tokens, delegates decryption to another account,
 * verifies the delegation, then revokes it — the full delegation lifecycle.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";

const ACCOUNT_1_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ACCOUNT_2_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";

function createAccountClient(pk: `0x${string}`, port: number) {
  const account = privateKeyToAccount(pk);
  return {
    account,
    client: createWalletClient({
      account,
      chain: foundry,
      transport: http(`http://127.0.0.1:${port}`),
    }),
  };
}

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

test("shield → delegate → verify active → revoke → verify revoked", async ({
  sdk,
  contracts,
  viemClient,
  account,
}) => {
  // Use Account #2 + USDC to avoid cooldown from other tests
  const { account: account2 } = createAccountClient(ACCOUNT_2_PK, 0);

  const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
  await token.shield(500n * 10n ** 6n);

  // Delegate
  const delegateResult = await token.delegateDecryption({ delegateAddress: account2.address });
  expect(delegateResult.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

  // Verify active
  const readonlyToken = sdk.createReadonlyToken(contracts.USDC);
  expect(
    await readonlyToken.isDelegated({
      delegatorAddress: account.address,
      delegateAddress: account2.address,
    }),
  ).toBe(true);

  const expiry = await readonlyToken.getDelegationExpiry({
    delegatorAddress: account.address,
    delegateAddress: account2.address,
  });
  expect(expiry).toBeGreaterThan(0n);

  // Revoke (after cooldown)
  await viemClient.increaseTime({ seconds: 2 });
  await viemClient.mine({ blocks: 1 });

  const revokeResult = await token.revokeDelegation({ delegateAddress: account2.address });
  expect(revokeResult.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

  // Verify revoked
  expect(
    await readonlyToken.isDelegated({
      delegatorAddress: account.address,
      delegateAddress: account2.address,
    }),
  ).toBe(false);
});

test("external account delegates to us via ACL, we query the delegation", async ({
  sdk,
  contracts,
  viemClient,
  anvilPort,
  account,
}) => {
  const { account: account1, client: account1Client } = createAccountClient(
    ACCOUNT_1_PK,
    anvilPort,
  );

  // Account #1 delegates decryption of cUSDT to Account #0 (us) with max expiry
  const hash = await account1Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT as Address, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash });

  // We can verify the delegation
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  expect(
    await readonlyToken.isDelegated({
      delegatorAddress: account1.address,
      delegateAddress: account.address,
    }),
  ).toBe(true);

  const expiry = await readonlyToken.getDelegationExpiry({
    delegatorAddress: account1.address,
    delegateAddress: account.address,
  });
  expect(expiry).toBe(2n ** 64n - 1n);
});

test("overwrite delegation with shorter expiry", async ({
  sdk,
  contracts,
  viemClient,
  anvilPort,
  account,
}) => {
  const { account: account2, client: account2Client } = createAccountClient(
    ACCOUNT_2_PK,
    anvilPort,
  );

  // Delegate with max expiry
  const hash1 = await account2Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT as Address, 2n ** 64n - 1n],
  });
  await viemClient.waitForTransactionReceipt({ hash: hash1 });

  // Overwrite with 2h expiry
  const latestBlock = await viemClient.getBlock();
  const newExpiry = latestBlock.timestamp + 7200n;
  const hash2 = await account2Client.writeContract({
    address: contracts.acl,
    abi: aclDelegateAbi,
    functionName: "delegateForUserDecryption",
    args: [account.address, contracts.cUSDT as Address, newExpiry],
  });
  await viemClient.waitForTransactionReceipt({ hash: hash2 });

  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  expect(
    await readonlyToken.getDelegationExpiry({
      delegatorAddress: account2.address,
      delegateAddress: account.address,
    }),
  ).toBe(newExpiry);
});

test("reject delegation with too-short expiry and revocation without delegation", async ({
  contracts,
  viemClient,
  anvilPort,
  account,
}) => {
  const { client: account2Client } = createAccountClient(ACCOUNT_2_PK, anvilPort);

  // Expiry < 1 hour should revert
  const latestBlock = await viemClient.getBlock();
  await expect(
    account2Client.writeContract({
      address: contracts.acl,
      abi: aclDelegateAbi,
      functionName: "delegateForUserDecryption",
      args: [account.address, contracts.cUSDT as Address, latestBlock.timestamp + 1800n],
    }),
  ).rejects.toThrow();

  // Revocation without delegation should revert
  await expect(
    account2Client.writeContract({
      address: contracts.acl,
      abi: aclRevokeAbi,
      functionName: "revokeDelegationForUserDecryption",
      args: [account.address, contracts.cUSDC as Address],
    }),
  ).rejects.toThrow();
});
