/**
 * Scenario: A user shields tokens and then explores every unshield path —
 * partial unshield, full-balance unshieldAll, resumeUnshield, and fee verification.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address, Hex } from "viem";

test("unshieldAll returns entire confidential balance to ERC-20", async ({
  sdk,
  contracts,
  readErc20Balance,
  computeFee,
  initialBalances,
}) => {
  const shieldAmount = 800n * 10n ** 6n;

  const erc20Before = await readErc20Balance(contracts.USDT);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  // Unshield everything (including the pre-deployed confidential balance)
  await token.unshieldAll();

  const erc20After = await readErc20Balance(contracts.USDT);

  // Total confidential before unshield = initial + shielded - shield fee
  const totalConfidential = initialBalances.cUSDT + shieldAmount - computeFee(shieldAmount);
  // Net received after unshield fee
  const netAfterUnshield = totalConfidential - computeFee(totalConfidential);
  expect(erc20After).toBe(erc20Before - shieldAmount + netAfterUnshield);

  // Confidential balance should be zero
  await sdk.allow(contracts.cUSDT as Address);
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  expect(await readonlyToken.balanceOf()).toBe(0n);
});

test("shield → partial unshield → second partial unshield", async ({
  sdk,
  contracts,
  readErc20Balance,
  computeFee,
  initialBalances,
}) => {
  const shieldAmount = 1000n * 10n ** 6n;
  const unshield1 = 300n * 10n ** 6n;
  const unshield2 = 200n * 10n ** 6n;

  const erc20Before = await readErc20Balance(contracts.USDT);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);
  await token.unshield(unshield1);
  await token.unshield(unshield2);

  const erc20After = await readErc20Balance(contracts.USDT);

  // ERC-20 = before - shieldAmount + unshield1 - fee(unshield1) + unshield2 - fee(unshield2)
  const expected =
    erc20Before -
    shieldAmount +
    unshield1 -
    computeFee(unshield1) +
    unshield2 -
    computeFee(unshield2);
  expect(erc20After).toBe(expected);

  // Confidential balance = initial + netAfterShield - unshield1 - unshield2
  await sdk.allow(contracts.cUSDT as Address);
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const expectedConfidential =
    initialBalances.cUSDT + shieldAmount - computeFee(shieldAmount) - unshield1 - unshield2;
  expect(await readonlyToken.balanceOf()).toBe(expectedConfidential);
});

test("unshield fees are consistent across USDT and USDC", async ({
  sdk,
  contracts,
  readErc20Balance,
  computeFee,
}) => {
  const amount = 600n * 10n ** 6n;
  const unshieldAmount = 400n * 10n ** 6n;

  // Shield + unshield USDT
  const usdtBefore = await readErc20Balance(contracts.USDT);
  const tokenUSDT = sdk.createToken(contracts.cUSDT as Address);
  await tokenUSDT.shield(amount);
  await tokenUSDT.unshield(unshieldAmount);
  const usdtAfter = await readErc20Balance(contracts.USDT);
  const usdtDelta = usdtBefore - usdtAfter;

  // Shield + unshield USDC
  const usdcBefore = await readErc20Balance(contracts.USDC);
  const tokenUSDC = sdk.createToken(contracts.cUSDC as Address);
  await tokenUSDC.shield(amount);
  await tokenUSDC.unshield(unshieldAmount);
  const usdcAfter = await readErc20Balance(contracts.USDC);
  const usdcDelta = usdcBefore - usdcAfter;

  // Both should have the same delta (same fee model)
  expect(usdtDelta).toBe(usdcDelta);

  // And match the expected fee calculation
  const expectedDelta = amount - unshieldAmount + computeFee(unshieldAmount);
  expect(usdtDelta).toBe(expectedDelta);
});

test("resumeUnshield completes a two-phase unshield from an existing unwrap tx", async ({
  sdk,
  contracts,
  readErc20Balance,
  computeFee,
}) => {
  const shieldAmount = 500n * 10n ** 6n;
  const unwrapAmount = 200n * 10n ** 6n;

  const erc20Before = await readErc20Balance(contracts.USDT);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  // Phase 1: submit unwrap (but don't finalize via unshield — call unwrap directly)
  const unwrapResult = await token.unwrap(unwrapAmount);
  expect(unwrapResult.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

  // Phase 2: resume from the unwrap tx hash (simulates page reload recovery)
  const finalizeResult = await token.resumeUnshield(unwrapResult.txHash as Hex);
  expect(finalizeResult.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

  // ERC-20 should reflect the unshield
  const erc20After = await readErc20Balance(contracts.USDT);
  const expected = erc20Before - shieldAmount + unwrapAmount - computeFee(unwrapAmount);
  expect(erc20After).toBe(expected);
});
