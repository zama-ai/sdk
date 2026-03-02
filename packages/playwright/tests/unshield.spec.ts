import { test, expect } from "../fixtures";

test("should shield USDT then unshield back to ERC20", async ({
  page,
  contracts,
  initialBalances,
  formatUnits,
  computeFee,
  readErc20Balance,
}) => {
  const shieldAmount = 1000n;
  const unshieldAmount = 500n;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/unshield?token=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(unshieldAmount.toString());
  await page.getByTestId("unshield-button").click();

  await expect(page.getByTestId("unshield-success")).toContainText("Tx: 0x");

  // Verify balance decreased by unshield amount
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance =
    initialBalances.cUSDT + shieldAmount - computeFee(shieldAmount) - unshieldAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // ERC-20 balance should increase by unshield amount minus unshield fee
  const expectedErc20 =
    initialBalances.USDT - shieldAmount + unshieldAmount - computeFee(unshieldAmount);
  await expect(page.getByTestId("token-row-USDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedErc20, 6),
  );

  // On-chain: ERC-20 balance should reflect shield then unshield
  const onChainUsdt = await readErc20Balance(contracts.USDT);
  expect(onChainUsdt).toBe(
    initialBalances.USDT - shieldAmount + unshieldAmount - computeFee(unshieldAmount),
  );
});

test("should shield USDC then unshield back to ERC20", async ({
  page,
  contracts,
  initialBalances,
  formatUnits,
  computeFee,
  readErc20Balance,
}) => {
  const shieldAmount = 1000n;
  const unshieldAmount = 500n;

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/unshield?token=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(unshieldAmount.toString());
  await page.getByTestId("unshield-button").click();

  await expect(page.getByTestId("unshield-success")).toContainText("Tx: 0x");

  // Verify balance decreased by unshield amount
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance =
    initialBalances.cUSDC + shieldAmount - computeFee(shieldAmount) - unshieldAmount;
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // ERC-20 balance should increase by unshield amount minus unshield fee
  const expectedErc20 =
    initialBalances.USDC - shieldAmount + unshieldAmount - computeFee(unshieldAmount);
  await expect(page.getByTestId("token-row-ERC20").getByTestId("balance")).toHaveText(
    formatUnits(expectedErc20, 6),
  );

  // On-chain: ERC-20 balance should reflect shield then unshield
  const onChainUsdc = await readErc20Balance(contracts.USDC);
  expect(onChainUsdc).toBe(
    initialBalances.USDC - shieldAmount + unshieldAmount - computeFee(unshieldAmount),
  );
});
