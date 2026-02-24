import { formatUnits } from "viem";
import { test, expect } from "../fixtures/test";

// Fee: ceiling division of (amount * 100) / 10000 — matches FeeManager.sol
function wrapFee(amount: bigint): bigint {
  return (amount * 100n + 9999n) / 10000n;
}

const DECIMALS = 6;
const fmt = (value: bigint) => formatUnits(value, DECIMALS);

const INITIAL_BALANCE = 1_000_000_000n - wrapFee(1_000_000_000n);

test("should shield USDT then unshield back to ERC20", async ({ page, contracts }) => {
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
  const expectedBalance = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount) - unshieldAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    fmt(expectedBalance),
  );
});

test("should shield USDC then unshield back to ERC20", async ({ page, contracts }) => {
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
  const expectedBalance = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount) - unshieldAmount;
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    fmt(expectedBalance),
  );
});
