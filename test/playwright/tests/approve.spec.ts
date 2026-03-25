import { test, expect } from "../fixtures";

const spender = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account #1

test("should approve spender on cUSDT and show isApproved true", async ({ page, contracts }) => {
  await page.goto(`/approve?token=${contracts.cUSDT}&spender=${spender}`);

  // Initially not approved
  await expect(page.getByTestId("approval-status")).toContainText("Approved: false");

  // Approve
  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("approve-success")).toContainText("Tx: 0x");

  // Reload to verify persisted approval
  await page.goto(`/approve?token=${contracts.cUSDT}&spender=${spender}`);
  await expect(page.getByTestId("approval-status")).toContainText("Approved: true");
});

test("should approve spender on cUSDC and show isApproved true", async ({ page, contracts }) => {
  await page.goto(`/approve?token=${contracts.cUSDC}&spender=${spender}`);

  await expect(page.getByTestId("approval-status")).toContainText("Approved: false");

  await page.getByTestId("approve-button").click();
  await expect(page.getByTestId("approve-success")).toContainText("Tx: 0x");

  await page.goto(`/approve?token=${contracts.cUSDC}&spender=${spender}`);
  await expect(page.getByTestId("approval-status")).toContainText("Approved: true");
});
