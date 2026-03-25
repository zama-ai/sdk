import { test, expect, mockWallet, mockRpc, WRONG_CHAIN_ID, TEST_ADDRESS } from "./fixtures";

test.describe("wrong network screen", () => {
  test("shows wrong network screen when connected on wrong chain", async ({ page }) => {
    await mockRpc(page);
    // switchBehavior: "reject" → the auto-switch on page load fails (4001 rejected),
    // so eth_chainId stays at WRONG_CHAIN_ID and Screen 2 is shown.
    await mockWallet(page, {
      accounts: [TEST_ADDRESS],
      chainId: WRONG_CHAIN_ID,
      switchBehavior: "reject",
    });
    await page.goto("/");

    await expect(page.getByText("Hoodi Network Required")).toBeVisible();
    await expect(page.getByRole("button", { name: "Switch to Hoodi" })).toBeVisible();
  });

  test("shows chain ID in wrong network message", async ({ page }) => {
    await mockRpc(page);
    await mockWallet(page, {
      accounts: [TEST_ADDRESS],
      chainId: WRONG_CHAIN_ID,
      switchBehavior: "reject",
    });
    await page.goto("/");

    // The page embeds the numeric chain ID (560048) in the wrong-network message.
    await expect(page.getByText(/560048/)).toBeVisible();
  });

  test("switches to Hoodi and shows main screen on button click", async ({ page }) => {
    await mockRpc(page);
    // switchBehavior: "reject" → auto-switch on load fails → Screen 2 shown.
    await mockWallet(page, {
      accounts: [TEST_ADDRESS],
      chainId: WRONG_CHAIN_ID,
      switchBehavior: "reject",
    });
    await page.goto("/");

    await expect(page.getByText("Hoodi Network Required")).toBeVisible();

    // Simulate the network switch succeeding: update mock's chainId so that
    // handleSwitchToHoodi()'s eth_chainId re-read returns Hoodi → isHoodi = true.
    await page.evaluate(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__setMockChainId("0x88bb0");
    });
    await page.getByRole("button", { name: "Switch to Hoodi" }).click({ force: true });

    await expect(page.getByText("Balances")).toBeVisible();
  });
});
