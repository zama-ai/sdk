import { test, expect } from "../fixtures";

test("should encrypt a value", async ({ page, contracts }) => {
  await page.goto(`/fhe-relayer?tokens=${contracts.cUSDT}`);
  await page.getByTestId("encrypt-button").click();

  await expect(page.getByTestId("encrypt-result")).toContainText("Handles count:");
  await expect(page.getByTestId("encrypt-result")).not.toContainText("count: 0");
});
