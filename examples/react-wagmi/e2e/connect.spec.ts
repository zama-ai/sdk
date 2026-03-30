import { test, expect, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

test.describe("connect flow", () => {
  test("shows connect screen when no wallet is installed", async ({ page }) => {
    // No mockWallet call — window.ethereum is undefined in a bare Chromium page.
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Connect Wallet" })).toBeVisible();
    await expect(page.getByText(/Connect your wallet/)).toBeVisible();
  });

  test("shows install error when connect is clicked without a wallet", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click();
    await expect(page.getByText(/No Ethereum wallet found/)).toBeVisible();
  });

  test("shows connect screen title", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Sepolia Confidential Token Quickstart" }),
    ).toBeVisible();
  });

  test("connects after clicking and shows main screen", async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    // accounts: [] → wagmi shows "Connect Wallet" screen on load (no auto-connect).
    // requestAccounts: [TEST_ADDRESS] → returned when connect({ connector: injected() }) fires.
    // WagmiSigner does not auto-connect without stored localStorage state — explicit
    // connect({ connector: injected() }) is always required in tests.
    await mockWallet({
      accounts: [],
      chainId: SEPOLIA_CHAIN_ID_HEX,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");

    await expect(page.getByText(/Connect your wallet/)).toBeVisible();
    // force: true bypasses the stability check that fails when React re-renders
    // the button text "Connect Wallet" → "Connecting…" during the async connect().
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });

    await expect(page.getByText("Balances")).toBeVisible();
  });
});
