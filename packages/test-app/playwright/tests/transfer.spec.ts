import { test, expect } from "../fixtures/test";

const recipient = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Hardhat account #1

test.describe("Confidential Transfer", () => {
  test("should shield USDT then transfer to another address", async ({ page, contracts }) => {
    await page.goto(`/shield?token=${contracts.USDT}&wrapper=${contracts.cUSDT}`);
    await page.getByTestId("amount-input").fill("1000");
    await page.getByTestId("shield-button").click();
    await expect(page.getByTestId("shield-success")).toBeVisible({
      timeout: 30000,
    });

    await page.goto(`/transfer?token=${contracts.cUSDT}`);
    await page.getByTestId("recipient-input").fill(recipient);
    await page.getByTestId("amount-input").fill("500");
    await page.getByTestId("transfer-button").click();

    await expect(page.getByTestId("transfer-success")).toBeVisible({
      timeout: 30000,
    });
  });

  test("should shield USDC then transfer to another address", async ({ page, contracts }) => {
    await page.goto(`/shield?token=${contracts.USDC}&wrapper=${contracts.cUSDC}`);
    await page.getByTestId("amount-input").fill("1000");
    await page.getByTestId("shield-button").click();
    await expect(page.getByTestId("shield-success")).toBeVisible({
      timeout: 30000,
    });

    await page.goto(`/transfer?token=${contracts.cUSDC}`);
    await page.getByTestId("recipient-input").fill(recipient);
    await page.getByTestId("amount-input").fill("500");
    await page.getByTestId("transfer-button").click();

    await expect(page.getByTestId("transfer-success")).toBeVisible({
      timeout: 30000,
    });
  });
});
