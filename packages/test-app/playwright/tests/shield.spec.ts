import { test, expect } from "../fixtures/test";

test.describe("Shield", () => {
  test("should shield USDT and show confidential balance", async ({ page, contracts }) => {
    await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
    await page.getByTestId("amount-input").fill("1000");
    await page.getByTestId("shield-button").click();

    await expect(page.getByTestId("shield-success")).toBeVisible({
      timeout: 30000,
    });

    await page.goto("/wallet");
    await page.getByTestId("reveal-button").click();
    const cUsdtRow = page.getByTestId("token-row-cUSDT");
    await expect(cUsdtRow).toBeVisible({ timeout: 30000 });
    await expect(cUsdtRow.getByTestId("balance")).not.toHaveText("0");
  });

  test("should shield USDC and show confidential balance", async ({ page, contracts }) => {
    await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
    await page.getByTestId("amount-input").fill("1000");
    await page.getByTestId("shield-button").click();

    await expect(page.getByTestId("shield-success")).toBeVisible({
      timeout: 30000,
    });

    await page.goto("/wallet");
    await page.getByTestId("reveal-button").click();
    const cUsdcRow = page.getByTestId("token-row-cERC20");
    await expect(cUsdcRow).toBeVisible({ timeout: 30000 });
    await expect(cUsdcRow.getByTestId("balance")).not.toHaveText("0");
  });
});
