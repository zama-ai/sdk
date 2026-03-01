import { test, expect } from "../fixtures/test";

test("should authorize all tokens", async ({ page, contracts }) => {
  await page.goto(`/authorize-all?tokens=${contracts.cUSDT},${contracts.cUSDC}`);
  await page.getByTestId("authorize-all-button").click();

  await expect(page.getByTestId("authorize-all-success")).toContainText("Authorized successfully");
});
