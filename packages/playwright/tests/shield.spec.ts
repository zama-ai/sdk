import { test, expect } from "../fixtures";

test("should shield USDT and show confidential balance", async ({
  page,
  contracts,
  initialBalances,
  formatUnits,
  computeFee,
  readErc20Balance,
}) => {
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();

  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const shieldAmount = 1000n;
  const expectedBalance = initialBalances.cUSDT + shieldAmount - computeFee(shieldAmount);
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // ERC-20 balance should decrease by the shield amount
  await expect(page.getByTestId("token-row-USDT").getByTestId("balance")).toHaveText(
    formatUnits(initialBalances.USDT - shieldAmount, 6),
  );

  // On-chain: ERC-20 balance should have decreased by shield amount
  const onChainUsdt = await readErc20Balance(contracts.USDT);
  expect(onChainUsdt).toBe(initialBalances.USDT - shieldAmount);
});

test("should shield USDC and show confidential balance", async ({
  page,
  contracts,
  initialBalances,
  formatUnits,
  computeFee,
  readErc20Balance,
}) => {
  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();

  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const shieldAmount = 1000n;
  const expectedBalance = initialBalances.cUSDC + shieldAmount - computeFee(shieldAmount);
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // ERC-20 balance should decrease by the shield amount
  await expect(page.getByTestId("token-row-ERC20").getByTestId("balance")).toHaveText(
    formatUnits(initialBalances.USDC - shieldAmount, 6),
  );

  // On-chain: ERC-20 balance should have decreased by shield amount
  const onChainUsdc = await readErc20Balance(contracts.USDC);
  expect(onChainUsdc).toBe(initialBalances.USDC - shieldAmount);
});
