import { formatUnits } from "viem";
import { test, expect } from "../fixtures/test";

// Fee: ceiling division of (amount * 100) / 10000 — matches FeeManager.sol
// wrapFeeBasisPoints = 100 (1%), MAX_BASIS_POINTS = 10000
function wrapFee(amount: bigint): bigint {
  return (amount * 100n + 9999n) / 10000n;
}

// Both test tokens have 6 decimals
const DECIMALS = 6;
const fmt = (value: bigint) => formatUnits(value, DECIMALS);

// Hardhat deployment wraps 1_000 * 10^6 = 1_000_000_000 tokens for the test account
// Net initial balance = 1_000_000_000 - wrapFee(1_000_000_000) = 990_000_000
const INITIAL_BALANCE = 1_000_000_000n - wrapFee(1_000_000_000n);

test("should show masked balances until reveal is clicked", async ({ page }) => {
  await page.goto("/wallet");
  const cUsdtRow = page.getByTestId("token-row-cUSDT");
  await expect(cUsdtRow).toBeVisible();

  // Balances should be masked before reveal
  await expect(cUsdtRow.getByTestId("balance")).toHaveText("****");

  // Click reveal
  await page.getByTestId("reveal-button").click();

  // Balance should show the exact initial value
  await expect(cUsdtRow.getByTestId("balance")).toHaveText(fmt(INITIAL_BALANCE));
});

test("should reveal exact cUSDT balance after shielding 500", async ({ page, contracts }) => {
  const shieldAmount = 500n;
  const expectedBalance = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount);

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toBeVisible();

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    fmt(expectedBalance),
  );
});

test("should reveal exact cUSDC balance after shielding 750", async ({ page, contracts }) => {
  const shieldAmount = 750n;
  const expectedBalance = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount);

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toBeVisible();

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    fmt(expectedBalance),
  );
});

test("should reveal exact balance after shield 1000 and transfer 300", async ({
  page,
  contracts,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 300n;
  const expectedBalance = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount) - transferAmount;

  // Shield
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toBeVisible();

  // Transfer
  await page.goto(`/transfer?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-button").click();
  await expect(page.getByTestId("transfer-success")).toBeVisible();

  // Reveal exact balance
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    fmt(expectedBalance),
  );
});

test("should hide balances again after clicking hide", async ({ page }) => {
  await page.goto("/wallet");
  const row = page.getByTestId("token-row-cUSDT");

  // Reveal
  await page.getByTestId("reveal-button").click();
  await expect(row.getByTestId("balance")).toHaveText(fmt(INITIAL_BALANCE));

  // Hide
  await page.getByTestId("reveal-button").click();
  await expect(row.getByTestId("balance")).toHaveText("****");
});
