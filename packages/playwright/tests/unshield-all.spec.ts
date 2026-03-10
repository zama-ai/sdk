import { test, expect } from "../fixtures";

test("should shield USDT then unshield all", async ({
  page,
  contracts,
  formatUnits,
  computeFee,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;

  const cUSDTBefore = confidentialBalances.cUSDT;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/unshield-all?token=${contracts.cUSDT}`);

  // Verify balance is shown before unshield
  const balanceBefore = cUSDTBefore + shieldAmount - computeFee(shieldAmount);
  await expect(page.getByTestId("current-balance")).toContainText(`Balance: ${balanceBefore}`);

  await page.getByTestId("unshield-all-button").click();
  await expect(page.getByTestId("unshield-all-success")).toContainText("Tx: 0x");

  // Verify balance is now 0
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(0n, 6),
  );
});

test("should shield USDC then unshield all", async ({
  page,
  contracts,
  formatUnits,
  computeFee,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;

  const cUSDCBefore = confidentialBalances.cUSDC;

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/unshield-all?token=${contracts.cUSDC}`);

  // Verify balance is shown before unshield
  const balanceBefore = cUSDCBefore + shieldAmount - computeFee(shieldAmount);
  await expect(page.getByTestId("current-balance")).toContainText(`Balance: ${balanceBefore}`);

  await page.getByTestId("unshield-all-button").click();
  await expect(page.getByTestId("unshield-all-success")).toContainText("Tx: 0x");

  // Verify balance is now 0
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    formatUnits(0n, 6),
  );
});
