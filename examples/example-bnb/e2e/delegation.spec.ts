import { test, expect, BSC_TESTNET_CHAIN_ID_HEX, TEST_ADDRESS, MAX_UINT64 } from "./fixtures";

// A valid Ethereum address different from TEST_ADDRESS — used to fill delegate inputs.
const VALID_DELEGATE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// All tests start with the wallet already connected on BNB.
test.describe("delegation section", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: BSC_TESTNET_CHAIN_ID_HEX });
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

// Exercises sdk.delegations.getStatus() (via useDelegationStatus) through the
// "Decrypt Balance On Behalf Of" card, which is part of the delegate-perspective section.
test.describe("delegation section — status display", () => {
  test.beforeEach(async ({ page, mockWallet }) => {
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: BSC_TESTNET_CHAIN_ID_HEX });
  });

  test("shows an active, permanent delegation with its expiry", async ({ page, mockRpc }) => {
    await mockRpc({ delegationExpiry: MAX_UINT64 });
    await page.goto("/");

    // DecryptAsCard is keyed on selectedTokenAddress and remounts once the registry
    // resolves — wait for that before filling, or the input gets cleared underneath us.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const decryptAsCard = page.locator(".card", { hasText: "Decrypt Balance On Behalf Of" });
    await decryptAsCard.getByPlaceholder("Owner address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByText("✓ Delegated · Permanent")).toBeVisible();
  });

  test("shows no active delegation when none exists", async ({ page, mockRpc }) => {
    await mockRpc({ delegationExpiry: 0n });
    await page.goto("/");

    // DecryptAsCard is keyed on selectedTokenAddress and remounts once the registry
    // resolves — wait for that before filling, or the input gets cleared underneath us.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const decryptAsCard = page.locator(".card", { hasText: "Decrypt Balance On Behalf Of" });
    await decryptAsCard.getByPlaceholder("Owner address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByText("No active delegation for this token")).toBeVisible();
  });
});
