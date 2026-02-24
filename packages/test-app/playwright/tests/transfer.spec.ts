import { test, expect } from "../fixtures/test";
const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account #1

test("should shield USDT then transfer to another address", async ({
  page,
  contracts,
  initialBalances,
  formatUnits,
  computeFee,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 500n;

  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/transfer?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill(recipient);
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-button").click();

  await expect(page.getByTestId("transfer-success")).toContainText("Tx: 0x");

  // Verify balance decreased by transfer amount
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance =
    initialBalances.cUSDT + shieldAmount - computeFee(shieldAmount) - transferAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});

test("should shield USDC then transfer to another address", async ({
  page,
  contracts,
  initialBalances,
  formatUnits,
  computeFee,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 500n;

  await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  await page.goto(`/transfer?token=${contracts.cUSDC}`);
  await page.getByTestId("recipient-input").fill(recipient);
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-button").click();

  await expect(page.getByTestId("transfer-success")).toContainText("Tx: 0x");

  // Verify balance decreased by transfer amount
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance =
    initialBalances.cUSDC + shieldAmount - computeFee(shieldAmount) - transferAmount;
  await expect(page.getByTestId("token-row-cERC20").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});
