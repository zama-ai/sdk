import { formatUnits } from "viem";
import { test, expect } from "../fixtures/test";

// Fee: ceiling division of (amount * 100) / 10000 — matches FeeManager.sol
function wrapFee(amount: bigint): bigint {
  return (amount * 100n + 9999n) / 10000n;
}

const DECIMALS = 6;
const fmt = (value: bigint) => formatUnits(value, DECIMALS);

// Hardhat deployment wraps 1_000 * 10^6 = 1_000_000_000 tokens for the test account
const INITIAL_BALANCE = 1_000_000_000n - wrapFee(1_000_000_000n);

test("should shield USDT and show confidential balance", async ({ page, contracts }) => {
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();

  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const shieldAmount = 1000n;
  const expectedBalance = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount);
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    fmt(expectedBalance),
  );
});

test("should shield USDC and show confidential balance", async ({ page, contracts }) => {
  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill("1000");
  await page.getByTestId("shield-button").click();

  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const shieldAmount = 1000n;
  const expectedBalance = INITIAL_BALANCE + shieldAmount - wrapFee(shieldAmount);
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    fmt(expectedBalance),
  );
});
