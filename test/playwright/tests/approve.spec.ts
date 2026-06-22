import { test, expect } from "../fixtures";

const operator = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account #1

test("should set operator on cUSDT and show isOperator true", async ({ page, contracts }) => {
  await page.goto(`/approve?token=${contracts.cUSDT}&spender=${operator}`);

  // Initially not approved
  await expect(page.getByTestId("approval-status")).toContainText("Approved: false");

  // Set operator
  await page.getByTestId("set-operator-button").click();
  await expect(page.getByTestId("set-operator-success")).toContainText("Tx: 0x");

  // Reload to verify persisted approval
  await page.goto(`/approve?token=${contracts.cUSDT}&spender=${operator}`);
  await expect(page.getByTestId("approval-status")).toContainText("Approved: true");
});

test("should set operator on cUSDC and show isOperator true", async ({ page, contracts }) => {
  await page.goto(`/approve?token=${contracts.cUSDC}&spender=${operator}`);

  await expect(page.getByTestId("approval-status")).toContainText("Approved: false");

  await page.getByTestId("set-operator-button").click();
  await expect(page.getByTestId("set-operator-success")).toContainText("Tx: 0x");

  await page.goto(`/approve?token=${contracts.cUSDC}&spender=${operator}`);
  await expect(page.getByTestId("approval-status")).toContainText("Approved: true");
});
