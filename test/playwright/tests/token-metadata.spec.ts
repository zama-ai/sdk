import { test, expect } from "../fixtures";

test("should show metadata for confidential token (cUSDT)", async ({ page, contracts }) => {
  await page.goto(`/token-metadata?token=${contracts.cUSDT}`);
  await expect(page.getByTestId("token-metadata-panel")).toBeVisible();

  await expect(page.getByTestId("metadata-name")).not.toHaveText("N/A");
  await expect(page.getByTestId("metadata-symbol")).toHaveText("cUSDT");
  await expect(page.getByTestId("metadata-decimals")).toHaveText("6");
  await expect(page.getByTestId("metadata-is-confidential")).toHaveText("true");
  // Wrappers infer total supply from the locked underlying balance
  await expect(page.getByTestId("metadata-total-supply")).toHaveText(/^\d+$/);
});

test("should show metadata for confidential token (cERC20)", async ({ page, contracts }) => {
  await page.goto(`/token-metadata?token=${contracts.cUSDC}`);
  await expect(page.getByTestId("token-metadata-panel")).toBeVisible();

  await expect(page.getByTestId("metadata-symbol")).toHaveText("cERC20");
  await expect(page.getByTestId("metadata-decimals")).toHaveText("6");
  await expect(page.getByTestId("metadata-is-confidential")).toHaveText("true");
});

test("should show plain ERC-20 as non-confidential (USDT)", async ({ page, contracts }) => {
  await page.goto(`/token-metadata?token=${contracts.USDT}`);
  await expect(page.getByTestId("token-metadata-panel")).toBeVisible();

  await expect(page.getByTestId("metadata-symbol")).toHaveText("USDT");
  await expect(page.getByTestId("metadata-decimals")).toHaveText("6");
  await expect(page.getByTestId("metadata-is-confidential")).toHaveText("false");
  await expect(page.getByTestId("metadata-is-wrapper")).toHaveText("false");
  // Total supply is a confidential-token read — not available for plain ERC-20s
  await expect(page.getByTestId("metadata-total-supply")).toHaveText("N/A");
});
