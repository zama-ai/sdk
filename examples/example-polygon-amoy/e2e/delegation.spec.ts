import { test, expect, AMOY_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

// A valid Ethereum address different from TEST_ADDRESS — used to fill delegate inputs.
const VALID_DELEGATE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// Each isolated test connects explicitly because wagmi has no persisted state.
test.describe("delegation section", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    await mockWallet({ accounts: [], chainId: AMOY_CHAIN_ID_HEX, requestAccounts: [TEST_ADDRESS] });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByText("Delegation — as owner")).toBeVisible();
  });

  test("shows section labels for owner and delegate perspectives", async ({ page }) => {
    await expect(page.getByText("Delegation — as owner")).toBeVisible();
    await expect(page.getByText("Delegation — as delegate")).toBeVisible();
  });

  test("delegation forms use native validation when no address is entered", async ({ page }) => {
    const grantCard = page.locator(".card", { hasText: "Grant Decryption Access" });
    const revokeCard = page.locator(".card", { hasText: "Revoke Decryption Access" });
    expect(
      await grantCard
        .getByPlaceholder("Delegate address (0x…)")
        .evaluate((input: HTMLInputElement) => input.checkValidity()),
    ).toBe(false);
    expect(
      await revokeCard
        .getByPlaceholder("Delegate address (0x…)")
        .evaluate((input: HTMLInputElement) => input.checkValidity()),
    ).toBe(false);
  });

  test("Grant Access is enabled when a valid address is entered", async ({ page }) => {
    // Wait for the registry to load and populate the combobox before interacting with cards.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const grantCard = page.locator(".card", { hasText: "Grant Decryption Access" });
    await grantCard.getByPlaceholder("Delegate address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByRole("button", { name: "Grant Access", exact: true })).toBeEnabled();
  });

  test("Revoke Access is enabled when a valid address is entered", async ({ page }) => {
    // Wait for the registry to load and populate the combobox before interacting with cards.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const revokeCard = page.locator(".card", { hasText: "Revoke Decryption Access" });
    await revokeCard.getByPlaceholder("Delegate address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByRole("button", { name: "Revoke Access", exact: true })).toBeEnabled();
  });
});
