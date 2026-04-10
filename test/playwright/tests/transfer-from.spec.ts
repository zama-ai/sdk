import { test, expect } from "../fixtures";

const operator = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat account #0 (test wallet)
const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account #1

test("should shield, approve, then transfer-from on cUSDT", async ({
  page,
  contracts,
  formatUnits,
  confidentialBalances,
}) => {
  const shieldAmount = 1000n;
  const transferAmount = 100n;

  const cUSDTBefore = confidentialBalances.cUSDT;

  // Shield first to ensure balance
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  // Approve the operator (self-approve so we can transferFrom our own tokens)
  await page.goto(`/approve?token=${contracts.cUSDT}&spender=${operator}`);
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("approve-success")).toContainText("Tx: 0x");

  // Transfer from
  await page.goto(`/transfer-from?token=${contracts.cUSDT}&from=${operator}`);
  await page.getByTestId("to-input").fill(recipient);
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-from-button").click();

  await expect(page.getByTestId("transfer-from-success")).toContainText("Tx: 0x");

  // Verify balance decreased by transfer amount
  await page.goto("/wallet");
  await page.getByTestId("reveal-button").click();
  const expectedBalance = cUSDTBefore + shieldAmount - transferAmount;
  await expect(page.getByTestId("token-row-cUSDT").getByTestId("balance")).toHaveText(
    formatUnits(expectedBalance, 6),
  );
});
