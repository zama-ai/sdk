import { test, expect, mockWallet, mockRpc, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

// All tests in this suite start with the wallet already connected on Sepolia.
test.describe("main screen", () => {
  test.beforeEach(async ({ page }) => {
    await mockRpc(page);
    await mockWallet(page, { accounts: [TEST_ADDRESS], chainId: SEPOLIA_CHAIN_ID_HEX });
    await page.goto("/");
  });

  test("renders all operation cards", async ({ page }) => {
    await expect(page.getByText("Balances")).toBeVisible();
    await expect(page.getByText("Shield — ERC-20 → Confidential")).toBeVisible();
    await expect(page.getByText("Confidential Transfer")).toBeVisible();
    await expect(page.getByText("Unshield — Confidential → ERC-20")).toBeVisible();
    await expect(page.getByText("Grant Decryption Access")).toBeVisible();
    await expect(page.getByText("Revoke Decryption Access")).toBeVisible();
    await expect(page.getByText("Decrypt Balance On Behalf Of")).toBeVisible();
  });

  test("shows connected address in header", async ({ page }) => {
    // Address may be shown in mixed or lowercase — match the checksum part.
    await expect(page.getByText(/Connected:/)).toBeVisible();
    await expect(page.getByText(/0xf39Fd6e51aad/i)).toBeVisible();
  });

  test("shows token selector with both tokens", async ({ page }) => {
    const select = page.getByRole("combobox");
    await expect(select).toBeVisible();
    await expect(select.locator("option", { hasText: "USDC Mock" })).toHaveCount(1);
    await expect(select.locator("option", { hasText: "USDT Mock" })).toHaveCount(1);
  });

  test("action buttons are disabled before metadata loads", async ({ page }) => {
    // eth_call returns "0x" from mockRpc, so useMetadata fails gracefully and
    // actionsDisabled stays true. All primary action buttons must be disabled.
    // exact: true avoids matching "Unshield" when searching for "Shield".
    await expect(page.getByRole("button", { name: "Shield", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Transfer", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Unshield", exact: true })).toBeDisabled();
    // Decrypt Balance requires cTokenMetadata (for decimals/symbol) — disabled until metadata loads.
    await expect(page.getByRole("button", { name: "Decrypt Balance", exact: true })).toBeDisabled();
  });

  test("shows dash for ERC-20 and confidential balances when data unavailable", async ({
    page,
  }) => {
    // Balances are "—" when queries haven't resolved (eth_call → 0x → parse error).
    const balanceValues = page.locator(".balance-value");
    // At least one balance value should be "—" (ERC-20, confidential, or ETH).
    await expect(balanceValues.first()).toBeVisible();
    const texts = await balanceValues.allTextContents();
    const hasDash = texts.some((t) => t.includes("—"));
    expect(hasDash).toBe(true);
  });

  test("ETH balance shows in header", async ({ page }) => {
    // ETH row is always rendered; shows "—" until the query resolves.
    await expect(page.getByText(/ETH:/)).toBeVisible();
  });

  test("shows metadata loading hint while metadata is pending", async ({ page }) => {
    // eth_call returns "0x" so useMetadata never resolves → loading hint is visible.
    await expect(page.getByText(/Loading token metadata/)).toBeVisible();
  });

  test("switching token updates the selector value", async ({ page }) => {
    const select = page.getByRole("combobox");
    await expect(select).toHaveValue("usdc");
    await select.selectOption("usdt");
    await expect(select).toHaveValue("usdt");
  });

  test("no pending unshield card shown on fresh load", async ({ page }) => {
    // IndexedDB is empty in a fresh browser context — no PendingUnshieldCard renders.
    await expect(page.getByText(/Pending Unshield/)).not.toBeVisible();
  });

  test("mint button is disabled before metadata loads", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Mint/ })).toBeDisabled();
  });
});
