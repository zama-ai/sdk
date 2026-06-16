import { test, expect, WRONG_CHAIN_ID, BSC_TESTNET_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

test.describe("wrong network screen", () => {
  // Start with the wallet connected on BNB and wait for the main screen to be visible
  // before each test. Emitting chainChanged while the page is still initializing could
  // race with the auto-switch logic in page.tsx (handleSwitchToBnb on load).
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: BSC_TESTNET_CHAIN_ID_HEX });
    await page.goto("/");
    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("shows wrong network screen when user switches away from BNB", async ({ page }) => {
    // Simulate the user switching away from BNB in their wallet — fires the chainChanged
    // event that page.tsx listens for to set isBnb = false and render Screen 2.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, WRONG_CHAIN_ID);

    await expect(page.getByText("BNB Network Required")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to BNB" })).toBeVisible();
  });

  test("shows chain ID in wrong network message", async ({ page }) => {
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, WRONG_CHAIN_ID);

    // The page embeds the numeric chain ID (97) in the wrong-network message.
    await expect(page.getByText(/97/)).toBeVisible();
  });

  test("transitions to main screen when user switches back to BNB", async ({ page }) => {
    // Switch away to show Screen 2.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, WRONG_CHAIN_ID);
    await expect(page.getByText("BNB Network Required")).toBeVisible();

    // Simulate the user switching back to BNB in their wallet — fires the chainChanged
    // event that page.tsx listens for to set isBnb = true and render Screen 3.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, BSC_TESTNET_CHAIN_ID_HEX);

    await expect(page.getByText("Balances")).toBeVisible();
  });
});
