/**
 * Scenario: A portfolio dashboard decrypts multiple token balances at once
 * and manages delegations in batch — exercising the static batch APIs on
 * ReadonlyToken and Token.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import { ReadonlyToken, Token } from "@zama-fhe/sdk";
import type { Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ACCOUNT_2_PK = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";
const account2 = privateKeyToAccount(ACCOUNT_2_PK);

test("batchDecryptBalances returns all token balances in one call", async ({
  sdk,
  contracts,
  computeFee,
  initialBalances,
}) => {
  const shieldUSDT = 300n * 10n ** 6n;
  const shieldUSDC = 500n * 10n ** 6n;

  // Shield both
  const tokenUSDT = sdk.createToken(contracts.cUSDT as Address);
  const tokenUSDC = sdk.createToken(contracts.cUSDC as Address);
  await tokenUSDT.shield(shieldUSDT);
  await tokenUSDC.shield(shieldUSDC);

  // Batch decrypt
  const readUSDT = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const readUSDC = sdk.createReadonlyToken(contracts.cUSDC as Address);
  const balances = await ReadonlyToken.batchDecryptBalances([readUSDT, readUSDC]);

  expect(balances.get(contracts.cUSDT as Address)).toBe(
    initialBalances.cUSDT + shieldUSDT - computeFee(shieldUSDT),
  );
  expect(balances.get(contracts.cUSDC as Address)).toBe(
    initialBalances.cUSDC + shieldUSDC - computeFee(shieldUSDC),
  );
});

test("batchDecryptBalances with error callback handles missing session gracefully", async ({
  sdk,
  contracts,
}) => {
  // Don't call allow — no session exists
  const readUSDT = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const readUSDC = sdk.createReadonlyToken(contracts.cUSDC as Address);

  const errors: Array<{ address: Address; error: Error }> = [];
  const balances = await ReadonlyToken.batchDecryptBalances([readUSDT, readUSDC], {
    onError: (error: Error, address: Address) => {
      errors.push({ address, error });
      return 0n; // fallback value
    },
  });

  // Either the map is empty or has zero balances; errors were captured
  expect(errors.length + balances.size).toBeGreaterThan(0);
});

test("batchDelegateDecryption delegates across multiple tokens", async ({ sdk, contracts }) => {
  // Create tokens with (underlying, wrapper) — delegation uses the underlying address
  const tokenUSDT = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
  const tokenUSDC = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
  await tokenUSDT.shield(100n * 10n ** 6n);
  await tokenUSDC.shield(100n * 10n ** 6n);

  // Batch delegate
  const results = await Token.batchDelegateDecryption({
    tokens: [tokenUSDT, tokenUSDC],
    delegateAddress: account2.address,
  });

  expect(results.size).toBe(2);
  for (const [, result] of results) {
    expect(result).toHaveProperty("txHash");
    if ("txHash" in result) {
      expect(result.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    }
  }

  // Verify delegations are active (use underlying address to match delegation target)
  const readUSDT = sdk.createReadonlyToken(contracts.USDT);
  const readUSDC = sdk.createReadonlyToken(contracts.USDC);

  for (const readToken of [readUSDT, readUSDC]) {
    const delegated = await readToken.isDelegated({
      delegatorAddress: (await sdk.signer.getAddress()) as Address,
      delegateAddress: account2.address,
    });
    expect(delegated).toBe(true);
  }
});

test("batchRevokeDelegation revokes across multiple tokens", async ({
  sdk,
  contracts,
  viemClient,
}) => {
  // Use (underlying, wrapper) — delegation targets the underlying address
  const tokenUSDT = sdk.createToken(contracts.USDT, contracts.cUSDT as Address);
  const tokenUSDC = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
  await tokenUSDT.shield(100n * 10n ** 6n);
  await tokenUSDC.shield(100n * 10n ** 6n);

  // Batch delegate
  const delegateResults = await Token.batchDelegateDecryption({
    tokens: [tokenUSDT, tokenUSDC],
    delegateAddress: account2.address,
  });
  expect(delegateResults.size).toBe(2);
  for (const [, result] of delegateResults) {
    expect(result).toHaveProperty("txHash");
  }

  // Verify delegations are active before revoking
  const signerAddress = (await sdk.signer.getAddress()) as Address;
  const readUSDT = sdk.createReadonlyToken(contracts.USDT);
  const readUSDC = sdk.createReadonlyToken(contracts.USDC);
  expect(
    await readUSDT.isDelegated({
      delegatorAddress: signerAddress,
      delegateAddress: account2.address,
    }),
  ).toBe(true);
  expect(
    await readUSDC.isDelegated({
      delegatorAddress: signerAddress,
      delegateAddress: account2.address,
    }),
  ).toBe(true);

  // Wait for cooldown
  await viemClient.increaseTime({ seconds: 2 });
  await viemClient.mine({ blocks: 1 });

  // Batch revoke
  const revokeResults = await Token.batchRevokeDelegation({
    tokens: [tokenUSDT, tokenUSDC],
    delegateAddress: account2.address,
  });
  expect(revokeResults.size).toBe(2);
  for (const [, result] of revokeResults) {
    expect(result).toHaveProperty("txHash");
  }

  // Verify delegations are revoked
  expect(
    await readUSDT.isDelegated({
      delegatorAddress: signerAddress,
      delegateAddress: account2.address,
    }),
  ).toBe(false);
  expect(
    await readUSDC.isDelegated({
      delegatorAddress: signerAddress,
      delegateAddress: account2.address,
    }),
  ).toBe(false);
});
