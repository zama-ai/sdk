import { test, expect } from "../fixtures/test";

test("should allow all tokens", async ({ page, contracts }) => {
  await page.goto(`/allow-all?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await page.getByTestId("allow-all-button").click();

  await expect(page.getByTestId("allow-all-success")).toContainText("Allowed successfully");
});
