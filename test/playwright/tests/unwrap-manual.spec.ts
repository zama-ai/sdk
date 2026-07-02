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

  // Guard: finalize is disabled until phase 1 produces an unwrap request ID
  await expect(page.getByTestId("finalize-button")).toBeDisabled();

  await page.getByTestId("amount-input").fill(unwrapAmount.toString());
  await page.getByTestId("unwrap-button").click();

  await expect(page.getByTestId("unwrap-success")).toContainText("Tx: 0x");
  // Burn handle should be a valid hex address
  await expect(page.getByTestId("burn-handle")).toContainText("Unwrap request ID: 0x");

  // Step 2: Finalize
  await expect(page.getByTestId("finalize-button")).toBeEnabled();
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

test("should unwrap the entire balance then finalize", async ({ page, contracts, formatUnits }) => {
  const shieldAmount = 400n;

  // Shield first to guarantee a non-zero confidential balance
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  // Step 1: Unwrap the full balance — no amount needed
  await page.goto(`/unwrap-manual?token=${contracts.cUSDT}`);
  await page.getByTestId("unwrap-all-button").click();

  await expect(page.getByTestId("unwrap-all-success")).toContainText("Tx: 0x");
  await expect(page.getByTestId("burn-handle")).toContainText("Unwrap request ID: 0x");

  // Step 2: Finalize
  await page.getByTestId("finalize-button").click();
  await expect(page.getByTestId("finalize-success")).toContainText("Tx: 0x");

  // The entire confidential balance is gone
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(0n, 6),
  );
});
