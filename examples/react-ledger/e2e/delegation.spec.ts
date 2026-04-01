import { test, expect, TEST_ADDRESS, DELEGATE_ADDRESS } from "./fixtures";

// All tests start with the Ledger connected and the main screen visible.
test.describe("delegation section", () => {
  test.beforeEach(async ({ page, mockRpc, mockLedger }) => {
    await mockRpc();
    await page.goto("/");
    await mockLedger({ address: TEST_ADDRESS });
    await page.getByRole("button", { name: "Connect Ledger" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("shows section labels for owner and delegate perspectives", async ({ page }) => {
    await expect(page.getByText("Delegation — as owner")).toBeVisible();
    await expect(page.getByText("Delegation — as delegate")).toBeVisible();
  });

  test("Grant Access is disabled when no address is entered", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Grant Access", exact: true })).toBeDisabled();
  });

  test("Revoke Access is disabled when no address is entered", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Revoke Access", exact: true })).toBeDisabled();
  });

  test("Grant Access is enabled when a valid delegate address is entered", async ({ page }) => {
    // Wait for the registry to load before interacting with cards.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const grantCard = page.locator(".card", { hasText: "Grant Decryption Access" });
    await grantCard.getByPlaceholder("Delegate address (0x…)").fill(DELEGATE_ADDRESS);
    await expect(page.getByRole("button", { name: "Grant Access", exact: true })).toBeEnabled();
  });

  test("Revoke Access is enabled when a valid delegate address is entered", async ({ page }) => {
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const revokeCard = page.locator(".card", { hasText: "Revoke Decryption Access" });
    await revokeCard.getByPlaceholder("Delegate address (0x…)").fill(DELEGATE_ADDRESS);
    await expect(page.getByRole("button", { name: "Revoke Access", exact: true })).toBeEnabled();
  });

  test("Decrypt Balance button is shown in delegate card", async ({ page }) => {
    const delegateCard = page.locator(".card", { hasText: "Decrypt Balance On Behalf Of" });
    await expect(delegateCard.getByRole("button", { name: "Decrypt Balance" })).toBeVisible();
  });
});
