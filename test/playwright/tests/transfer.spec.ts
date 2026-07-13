import { test, expect } from "../fixtures";

const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account #1

test("should shield USDT then transfer to another address", async ({
  page,
  contracts,
  formatUnits,
  readErc20Balance,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 500n;

  const usdtBefore = await readErc20Balance(contracts.USDT);
  const cUSDTBefore = confidentialBalances.cUSDT;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/transfer?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill(recipient);
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-button").click();

  await expect(page.getByTestId("transfer-success")).toContainText("Tx: 0x");

  // Verify confidential balance changed by expected delta
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDTBefore + shieldAmount - transferAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // On-chain: ERC-20 balance should have decreased by shield amount only (transfer is confidential)
  const onChainUsdt = await readErc20Balance(contracts.USDT);
  expect(onChainUsdt).toBe(usdtBefore - shieldAmount);
});

test("should shield USDC then transfer to another address", async ({
  page,
  contracts,
  formatUnits,
  readErc20Balance,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 500n;

  const usdcBefore = await readErc20Balance(contracts.USDC);
  const cUSDCBefore = confidentialBalances.cUSDC;

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/transfer?token=${contracts.cUSDC}`);
  await page.getByTestId("recipient-input").fill(recipient);
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-button").click();

  await expect(page.getByTestId("transfer-success")).toContainText("Tx: 0x");

  // Verify confidential balance changed by expected delta
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDCBefore + shieldAmount - transferAmount;
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );

  // On-chain: ERC-20 balance should have decreased by shield amount only (transfer is confidential)
  const onChainUsdc = await readErc20Balance(contracts.USDC);
  expect(onChainUsdc).toBe(usdcBefore - shieldAmount);
});

test("should transfer zero when the amount exceeds the confidential balance", async ({
  page,
  contracts,
  formatUnits,
  confidentialBalances,
}) => {
  // ERC-7984 semantics: an over-balance transfer must NOT revert (a revert would
  // leak balance information) — the token transfers an encrypted zero instead.
  const cUSDTBefore = confidentialBalances.cUSDT;

  await page.goto(`/transfer?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill(recipient);
  await page.getByTestId("amount-input").fill((cUSDTBefore + 1000n).toString());
  await page.getByTestId("transfer-button").click();

  await expect(page.getByTestId("transfer-success")).toContainText("Tx: 0x");

  // Balance is unchanged: the transferred amount was clamped to zero
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(cUSDTBefore, 6),
  );
});

test("should surface an error for a malformed recipient address", async ({ page, contracts }) => {
  await page.goto(`/transfer?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill("0xnot-a-valid-address");
  await page.getByTestId("amount-input").fill("100");
  await page.getByTestId("transfer-button").click();

  await expect(page.getByTestId("transfer-error")).toContainText("Error:");
  await expect(page.getByTestId("transfer-success")).not.toBeVisible();
});
