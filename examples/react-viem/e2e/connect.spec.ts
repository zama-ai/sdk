import { test, expect, mockWallet, mockRpc, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

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

  test("auto-detects existing connection and shows main screen", async ({ page }) => {
    await mockRpc(page);
    // Wallet already connected on Sepolia — page auto-detects via useEffect.
    await mockWallet(page, { accounts: [TEST_ADDRESS], chainId: SEPOLIA_CHAIN_ID_HEX });
    await page.goto("/");

    await expect(page.getByText("Balances")).toBeVisible();
    await expect(page.getByText(/Connected:/)).toBeVisible();
  });

  test("connects after clicking and shows main screen", async ({ page }) => {
    await mockRpc(page);
    // accounts: [] → eth_accounts returns [] → page shows "Connect Wallet" screen.
    // requestAccounts: [TEST_ADDRESS] → eth_requestAccounts returns the address when
    // connect() is called, without touching the eth_accounts read path.
    await mockWallet(page, {
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
