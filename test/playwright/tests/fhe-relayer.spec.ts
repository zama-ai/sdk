import { test, expect } from "../fixtures";

test("should create EIP-712 typed data", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);

  await page.getByTestId("create-eip712-button").click();
  await expect(page.getByTestId("create-eip712-result")).toContainText("EIP-712 created:");
});

test("should encrypt a value", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);
  await page.getByTestId("encrypt-button").click();

  await expect(page.getByTestId("encrypt-result")).toContainText("Handles count:");
  await expect(page.getByTestId("encrypt-result")).not.toContainText("count: 0");
});
