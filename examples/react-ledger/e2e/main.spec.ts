import { test, expect, TEST_ADDRESS, MOCK_CTOKEN1_ADDRESS, MOCK_CTOKEN2_ADDRESS } from "./fixtures";

// All tests in this suite start with the Ledger connected and the main screen visible.
test.describe("main screen", () => {
  test.beforeEach(async ({ page, mockRpc, mockLedger }) => {
    await mockRpc();
    await page.goto("/");
    await mockLedger({ address: TEST_ADDRESS });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
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
    await expect(page.getByText(/Connected:/)).toBeVisible();
    await expect(page.getByText(/0xf39Fd6e51aad/i)).toBeVisible();
  });

  test("shows ETH balance row in header", async ({ page }) => {
    await expect(page.getByText(/ETH:/)).toBeVisible();
  });

  test("shows account number in header", async ({ page }) => {
    // Default account index is 0.
    await expect(page.getByText(/Account #0/)).toBeVisible();
  });

  test("shows Verify address button in header", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Verify address" })).toBeVisible();
  });

  test("verify address button shows confirmation after click", async ({ page }) => {
    // verifyAddress() is mocked to resolve immediately (no-op) by mockLedger.
    await page.getByRole("button", { name: "Verify address" }).click();
    // Button label should update to "✓ Verified" and then reset after 4 s.
    await expect(page.getByRole("button", { name: /Verified/ })).toBeVisible();
  });

  test("shows token selector populated from the registry", async ({ page }) => {
    const select = page.getByRole("combobox");
    await expect(select).toBeVisible();
    await expect(select.locator("option", { hasText: "USDC Mock" })).toHaveCount(1);
    await expect(select.locator("option", { hasText: "USDT Mock" })).toHaveCount(1);
  });

  test("switching token updates the selector value", async ({ page }) => {
    const select = page.getByRole("combobox");
    await expect(select).toHaveValue(MOCK_CTOKEN1_ADDRESS);
    await select.selectOption(MOCK_CTOKEN2_ADDRESS);
    await expect(select).toHaveValue(MOCK_CTOKEN2_ADDRESS);
  });

  test("shows dash for ERC-20 balance before data loads", async ({ page }) => {
    // balanceOf returns "0x" (empty data) from the mock — query fails → "—".
    const balanceValues = page.locator(".balance-value");
    await expect(balanceValues.first()).toBeVisible();
    const texts = await balanceValues.allTextContents();
    expect(texts.some((t) => t.includes("—"))).toBe(true);
  });

  test("no pending unshield card on fresh load", async ({ page }) => {
    // IndexedDB is empty in a fresh browser context.
    await expect(page.getByText(/Pending Unshield/)).not.toBeVisible();
  });

  test("mint button is enabled once the registry loads a token", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Mint/ })).toBeEnabled();
  });

  test("shows delegation section labels", async ({ page }) => {
    await expect(page.getByText("Delegation — as owner")).toBeVisible();
    await expect(page.getByText("Delegation — as delegate")).toBeVisible();
  });
});

// Registry empty state — simulates a registry that has no valid pairs.
test.describe("registry empty state", () => {
  test.beforeEach(async ({ page, mockRpc, mockLedger }) => {
    await mockRpc({ emptyRegistry: true });
    await page.goto("/");
    await mockLedger({ address: TEST_ADDRESS });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    // Wait for the main header (connect succeeded) before asserting on registry state.
    await expect(page.getByText(/Connected:/)).toBeVisible();
  });

  test("shows no tokens available when registry returns no pairs", async ({ page }) => {
    await expect(page.getByText("No tokens available.")).toBeVisible();
  });

  test("action buttons are disabled when no tokens are available", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Shield", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Transfer", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Unshield", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Mint/ })).toBeDisabled();
    // Scope to the Balances card to avoid strict-mode ambiguity with DecryptAsCard's button.
    const balancesCard = page.locator(".card", { hasText: "Balances" }).first();
    await expect(balancesCard.getByRole("button", { name: "Decrypt Balance" })).toBeDisabled();
  });
});
