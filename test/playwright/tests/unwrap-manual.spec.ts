import { test, expect } from "../fixtures";

test("should shield USDT then unwrap and finalize in two steps", async ({
  page,
  contracts,
  formatUnits,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;
  const unwrapAmount = 500n;

  const cUSDTBefore = confidentialBalances.cUSDT;

  // Shield first
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  // Step 1: Unwrap
  await page.goto(`/unwrap-manual?token=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(unwrapAmount.toString());
  await page.getByTestId("unwrap-button").click();

  await expect(page.getByTestId("unwrap-success")).toContainText("Tx: 0x");
  // Burn handle should be a valid hex address
  await expect(page.getByTestId("burn-handle")).toContainText("Unwrap request ID: 0x");

  // Step 2: Finalize
  await page.getByTestId("finalize-button").click();
  await expect(page.getByTestId("finalize-success")).toContainText("Tx: 0x");

  // Verify balance decreased by unwrap amount
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDTBefore + shieldAmount - unwrapAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});
