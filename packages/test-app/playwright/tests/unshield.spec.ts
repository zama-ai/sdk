import { test, expect } from "../fixtures/test";

test.describe("Unshield", () => {
  test("should shield USDT then unshield back to ERC20", async ({ page, contracts }) => {
    await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
    await page.getByTestId("amount-input").fill("1000");
    await page.getByTestId("shield-button").click();
    await expect(page.getByTestId("shield-success")).toBeVisible({
      timeout: 30000,
    });

    await page.goto(`/unshield?token=${contracts.cUSDT}`);
    await page.getByTestId("amount-input").fill("500");
    await page.getByTestId("unshield-button").click();

    await expect(page.getByTestId("unshield-success")).toBeVisible({
      timeout: 30000,
    });
  });

  test("should shield USDC then unshield back to ERC20", async ({ page, contracts }) => {
    await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
    await page.getByTestId("amount-input").fill("1000");
    await page.getByTestId("shield-button").click();
    await expect(page.getByTestId("shield-success")).toBeVisible({
      timeout: 30000,
    });

    await page.goto(`/unshield?token=${contracts.cUSDC}`);
    await page.getByTestId("amount-input").fill("500");
    await page.getByTestId("unshield-button").click();

    await expect(page.getByTestId("unshield-success")).toBeVisible({
      timeout: 30000,
    });
  });
});
