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

// Hardhat deployment mints 1_000 * 10^6 ERC-20 tokens to the test account.
// Wrapping is done by a separate signer (alice), so the test account keeps all minted ERC-20.
const INITIAL_ERC20_BALANCE = 1_000n * 10n ** 6n;

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

  // ERC-20 balance should decrease by the shield amount
  await expect(page.getByTestId("token-row-USDT").getByTestId("balance")).toHaveText(
    fmt(INITIAL_ERC20_BALANCE - shieldAmount),
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

  // ERC-20 balance should decrease by the shield amount
  await expect(page.getByTestId("token-row-ERC20").getByTestId("balance")).toHaveText(
    fmt(INITIAL_ERC20_BALANCE - shieldAmount),
  );
});
