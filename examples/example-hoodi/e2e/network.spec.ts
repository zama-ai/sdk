import { test, expect, WRONG_CHAIN_ID, HOODI_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

test.describe("wrong network screen", () => {
  // Connect explicitly, then exercise wagmi's reactive chain state.
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    await mockWallet({
      accounts: [],
      chainId: HOODI_CHAIN_ID_HEX,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("shows wrong network screen when user switches away from Hoodi", async ({ page }) => {
    // Simulate the user switching away from Hoodi in their wallet — fires the chainChanged
    // event consumed by wagmi's connector.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, WRONG_CHAIN_ID);

    await expect(page.getByText("Hoodi Network Required")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to Hoodi" })).toBeVisible();
  });

  test("shows chain ID in wrong network message", async ({ page }) => {
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, WRONG_CHAIN_ID);

    // The page embeds the numeric chain ID (560048) in the wrong-network message.
    await expect(page.getByText(/560048/)).toBeVisible();
  });

  test("transitions to main screen when user switches back to Hoodi", async ({ page }) => {
    // Switch away to show Screen 2.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, WRONG_CHAIN_ID);
    await expect(page.getByText("Hoodi Network Required")).toBeVisible();

    // Simulate the user switching back to Hoodi in their wallet — fires the chainChanged
    // event consumed by wagmi's connector.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, HOODI_CHAIN_ID_HEX);

    await expect(page.getByText("Balances")).toBeVisible();
  });
});
