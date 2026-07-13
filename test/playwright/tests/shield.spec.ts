import { test, expect } from "../fixtures";

test("should shield USDT and show confidential balance", async ({
  page,
  contracts,
  formatUnits,
  readErc20Balance,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;

  const usdtBefore = await readErc20Balance(contracts.USDT);
  const cUSDTBefore = confidentialBalances.cUSDT;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();

  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDTBefore + shieldAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // ERC-20 balance should decrease by the shield amount
  await expect(page.getByTestId("token-row-USDT").getByTestId("balance")).toHaveText(
    formatUnits(usdtBefore - shieldAmount, 6),
  );

  // On-chain: ERC-20 balance should have decreased by shield amount
  const onChainUsdt = await readErc20Balance(contracts.USDT);
  expect(onChainUsdt).toBe(usdtBefore - shieldAmount);
});

test("should shield USDC and show confidential balance", async ({
  page,
  contracts,
  formatUnits,
  readErc20Balance,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;

  const usdcBefore = await readErc20Balance(contracts.USDC);
  const cUSDCBefore = confidentialBalances.cUSDC;

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();

  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDCBefore + shieldAmount;
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // ERC-20 balance should decrease by the shield amount
  await expect(page.getByTestId("token-row-ERC20").getByTestId("balance")).toHaveText(
    formatUnits(usdcBefore - shieldAmount, 6),
  );

  // On-chain: ERC-20 balance should have decreased by shield amount
  const onChainUsdc = await readErc20Balance(contracts.USDC);
  expect(onChainUsdc).toBe(usdcBefore - shieldAmount);
});

test("should surface an error when shielding more than the ERC-20 balance", async ({
  page,
  contracts,
  readErc20Balance,
}) => {
  const usdtBefore = await readErc20Balance(contracts.USDT);

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);

  // The current allowance is displayed before shielding
  await expect(page.getByTestId("allowance")).toContainText("Current allowance:");

  await page.getByTestId("amount-input").fill((usdtBefore + 1n).toString());
  await page.getByTestId("shield-button").click();

  await expect(page.getByTestId("shield-error")).toContainText("Error:");
  await expect(page.getByTestId("shield-success")).not.toBeVisible();

  // On-chain: ERC-20 balance is untouched
  const onChainUsdt = await readErc20Balance(contracts.USDT);
  expect(onChainUsdt).toBe(usdtBefore);
});

test("should approve the wrapper for an explicit underlying amount", async ({
  page,
  contracts,
}) => {
  const approveAmount = 12345n;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await expect(page.getByTestId("allowance")).toContainText("Current allowance:");

  await page.getByTestId("approve-amount-input").fill(approveAmount.toString());
  await page.getByTestId("approve-underlying-button").click();

  await expect(page.getByTestId("approve-underlying-success")).toContainText("Tx: 0x");
  // The allowance query is invalidated after approval and reflects the new value
  await expect(page.getByTestId("allowance")).toHaveText(`Current allowance: ${approveAmount}`);
});
