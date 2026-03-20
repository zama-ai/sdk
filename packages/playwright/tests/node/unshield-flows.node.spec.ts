/**
 * Scenario: A user shields tokens and then explores every unshield path —
 * partial unshield, full-balance unshieldAll, and fee verification.
 */
import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test("unshieldAll returns entire confidential balance to ERC-20", async ({
  sdk,
  contracts,
  readErc20Balance,
  computeFee,
}) => {
  const shieldAmount = 800n * 10n ** 6n;

  const erc20Before = await readErc20Balance(contracts.USDT);

  const token = sdk.createToken(contracts.cUSDT as Address);
  await token.shield(shieldAmount);

  // Unshield everything
  await token.unshieldAll();

  const erc20After = await readErc20Balance(contracts.USDT);

  // The user gets back the net amount minus fees on both shield and unshield
  const netAfterShield = shieldAmount - computeFee(shieldAmount);
  const netAfterUnshield = netAfterShield - computeFee(netAfterShield);
  expect(erc20After).toBe(erc20Before - shieldAmount + netAfterUnshield);

  // Confidential balance should be zero
  await sdk.allow(contracts.cUSDT as Address);
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const confidentialBalance = await readonlyToken.balanceOf();
  expect(confidentialBalance).toBe(0n);
});

test("shield → partial unshield → second partial unshield", async ({
  sdk,
  contracts,
  readErc20Balance,
  computeFee,
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

  // Confidential balance = netAfterShield - unshield1 - unshield2
  await sdk.allow(contracts.cUSDT as Address);
  const readonlyToken = sdk.createReadonlyToken(contracts.cUSDT as Address);
  const confidentialBalance = await readonlyToken.balanceOf();
  const expectedConfidential = shieldAmount - computeFee(shieldAmount) - unshield1 - unshield2;
  expect(confidentialBalance).toBe(expectedConfidential);
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
