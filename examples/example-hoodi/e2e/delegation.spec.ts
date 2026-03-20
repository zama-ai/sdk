import { test, expect, mockWallet, mockRpc, HOODI_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

// A valid Ethereum address different from TEST_ADDRESS — used to fill delegate inputs.
const VALID_DELEGATE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// All tests start with the wallet already connected on Hoodi.
test.describe("delegation section", () => {
  test.beforeEach(async ({ page }) => {
    await mockRpc(page);
    await mockWallet(page, { accounts: [TEST_ADDRESS], chainId: HOODI_CHAIN_ID_HEX });
    await page.goto("/");
  });

  test("shows section labels for owner and delegate perspectives", async ({ page }) => {
    await expect(page.getByText("Delegation — as owner")).toBeVisible();
    await expect(page.getByText("Delegation — as delegate")).toBeVisible();
  });

  test("delegation buttons are disabled when no address is entered", async ({ page }) => {
    // Grant Access and Revoke Access require a valid delegate address — disabled when input is empty.
    await expect(page.getByRole("button", { name: "Grant Access", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Revoke Access", exact: true })).toBeDisabled();
  });

  test("Grant Access is enabled when a valid address is entered", async ({ page }) => {
    const grantCard = page.locator(".card", { hasText: "Grant Decryption Access" });
    await grantCard.getByPlaceholder("Delegate address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByRole("button", { name: "Grant Access", exact: true })).toBeEnabled();
  });

  test("Revoke Access is enabled when a valid address is entered", async ({ page }) => {
    const revokeCard = page.locator(".card", { hasText: "Revoke Decryption Access" });
    await revokeCard.getByPlaceholder("Delegate address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByRole("button", { name: "Revoke Access", exact: true })).toBeEnabled();
  });
});
