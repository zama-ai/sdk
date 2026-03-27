import { test, expect, WRONG_CHAIN_ID, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

test.describe("wrong network screen", () => {
  test("shows wrong network screen when connected on wrong chain", async ({
    page,
    mockRpc,
    mockWallet,
  }) => {
    await mockRpc();
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: WRONG_CHAIN_ID });
    await page.goto("/");

    await expect(page.getByText("Sepolia Network Required")).toBeVisible();
  });

  test("shows chain ID in wrong network message", async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: WRONG_CHAIN_ID });
    await page.goto("/");

    // The page embeds the numeric chain ID (11155111) in the wrong-network message.
    await expect(page.getByText(/11155111/)).toBeVisible();
  });

  test("transitions to main screen when user switches to Sepolia in their wallet", async ({
    page,
    mockRpc,
    mockWallet,
  }) => {
    await mockRpc();
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: WRONG_CHAIN_ID });
    await page.goto("/");

    await expect(page.getByText("Sepolia Network Required")).toBeVisible();

    // Simulate the user switching to Sepolia in their wallet — fires the chainChanged
    // event that page.tsx listens for to set isSepolia = true and render Screen 3.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, SEPOLIA_CHAIN_ID_HEX);

    await expect(page.getByText("Balances")).toBeVisible();
  });
});
