import { test, expect } from "../fixtures";

test("should shield USDT, unwrap, then resume unshield", async ({
  page,
  contracts,
  formatUnits,
  confidentialBalances,
}) => {
  const shieldAmount = 500n;
  const unshieldAmount = 200n;

  const cUSDTBefore = confidentialBalances.cUSDT;

  // Shield first
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  // Navigate to resume-unshield page
  await page.goto(`/resume-unshield?token=${contracts.cUSDT}`);

  // Step 1: Unwrap (phase 1 only)
  await page.getByTestId("amount-input").fill(unshieldAmount.toString());
  await page.getByTestId("unwrap-button").click();
  await expect(page.getByTestId("unwrap-success")).toContainText("Tx: 0x");
  await expect(page.getByTestId("unwrap-tx-hash")).toContainText("0x");

  // Step 2: Resume unshield from the tx hash
  await page.getByTestId("resume-button").click();
  await expect(page.getByTestId("resume-success")).toContainText("Tx: 0x");

  // Verify confidential balance decreased
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDTBefore + shieldAmount - unshieldAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});
