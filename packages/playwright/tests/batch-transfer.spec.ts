import { test, expect } from "../fixtures";
import { WRAPPER_ABI } from "../../sdk/src/abi/wrapper.abi";

test("should shield USDT then batch transfer to two recipients", async ({
  page,
  contracts,
  viemClient,
}) => {
  const shieldAmount = 500n;
  const transferAmount1 = 50n;
  const transferAmount2 = 50n;
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat #1

  // Shield first
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  // Approve the TransferBatcher as an operator on the cToken
  await viemClient.writeContract({
    address: contracts.cUSDT,
    abi: WRAPPER_ABI,
    functionName: "setOperator",
    args: [contracts.transferBatcher, Math.floor(Date.now() / 1000) + 86400],
  });

  // Navigate to batch transfer page
  await page.goto(
    `/batch-transfer?token=${contracts.cUSDT}&batcher=${contracts.transferBatcher}&feeManager=${contracts.feeManager}`,
  );

  // Wait for fee to load
  await expect(page.getByTestId("batch-fee")).toBeVisible();

  // Fill in two transfers
  await page.getByTestId("recipient1-input").fill(recipient);
  await page.getByTestId("amount1-input").fill(transferAmount1.toString());
  await page.getByTestId("recipient2-input").fill(recipient);
  await page.getByTestId("amount2-input").fill(transferAmount2.toString());

  // Execute batch transfer
  await page.getByTestId("batch-transfer-button").click();
  await expect(page.getByTestId("batch-transfer-success")).toContainText("Tx: 0x");
});
