import { test, expect } from "../fixtures/test";

// Fee: ceiling division of (amount * 100) / 10000 — matches FeeManager.sol
function wrapFee(amount: bigint): bigint {
  return (amount * 100n + 9999n) / 10000n;
}

const INITIAL_BALANCE = 1_000_000_000n - wrapFee(1_000_000_000n);

test("should shield USDT then unshield all", async ({ page, contracts }) => {
  const shieldAmount = 1000n;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/unshield-all?token=${contracts.cUSDT}`);

  // Verify balance is shown before unshield
  const balanceBefore = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount);
  await expect(page.getByTestId("current-balance")).toContainText(`Balance: ${balanceBefore}`);

  await page.getByTestId("unshield-all-button").click();
  await expect(page.getByTestId("unshield-all-success")).toContainText("Tx: 0x");

  // Verify balance is now 0
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText("0");
});

test("should shield USDC then unshield all", async ({ page, contracts }) => {
  const shieldAmount = 1000n;

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/unshield-all?token=${contracts.cUSDC}`);

  // Verify balance is shown before unshield
  const balanceBefore = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount);
  await expect(page.getByTestId("current-balance")).toContainText(`Balance: ${balanceBefore}`);

  await page.getByTestId("unshield-all-button").click();
  await expect(page.getByTestId("unshield-all-success")).toContainText("Tx: 0x");

  // Verify balance is now 0
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText("0");
});
