import { test, expect } from "../fixtures";

test("should show shield and transfer events with decrypted amounts", async ({
  page,
  contracts,
  formatUnits,
}) => {
  const shieldAmount = 200n;
  const transferAmount = 50n;
  const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

  // Step 1: Shield USDT (generates Wrapped event)
  await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
  await page.getByTestId("amount-input").fill(shieldAmount.toString());
  await page.getByTestId("shield-button").click();
  await expect(page.getByTestId("shield-success")).toContainText("Tx: 0x");

  // Step 2: Transfer cUSDT (generates ConfidentialTransfer event)
  await page.goto(`/transfer?token=${contracts.cUSDT}`);
  await page.getByTestId("recipient-input").fill(recipient);
  await page.getByTestId("amount-input").fill(transferAmount.toString());
  await page.getByTestId("transfer-button").click();
  await expect(page.getByTestId("transfer-success")).toContainText("Tx: 0x");

  // Step 3: Navigate to activity feed
  await page.goto(`/activity-feed?token=${contracts.cUSDT}`);

  // Wait for activity to load and decrypt
  await expect(page.getByTestId("activity-count")).toBeVisible();

  // Should have at least 2 events (shield + transfer from this test,
  // plus possibly events from the initial deployment setup)
  const count = Number(await page.getByTestId("activity-count").textContent());
  expect(count).toBeGreaterThanOrEqual(2);

  // Find the most recent events (activity is sorted by blockNumber descending)
  // Event 0 should be the transfer (most recent)
  await expect(page.getByTestId("activity-type-0")).toHaveText("transfer");
  await expect(page.getByTestId("activity-direction-0")).toHaveText("outgoing");
  // Transfer amount should be decrypted
  await expect(page.getByTestId("activity-amount-0")).toHaveText(formatUnits(transferAmount, 6));

  // Event 1 should be the shield
  await expect(page.getByTestId("activity-type-1")).toHaveText("shield");
  await expect(page.getByTestId("activity-direction-1")).toHaveText("incoming");
  // Shield amount is clear (not encrypted)
  await expect(page.getByTestId("activity-amount-1")).toHaveText(formatUnits(shieldAmount, 6));
});
