import { test, expect, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS, MAX_UINT64 } from "./fixtures";

// A valid Ethereum address different from TEST_ADDRESS — used to fill delegate inputs.
const VALID_DELEGATE = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// All tests start from the connect screen and click Connect Wallet.
// WagmiSigner does not auto-connect without stored localStorage state.
test.describe("delegation section", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    await mockWallet({
      accounts: [],
      chainId: SEPOLIA_CHAIN_ID_HEX,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
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
    // Wait for the registry to load and the first token to be auto-selected before
    // filling the input. The delegation cards have keys that include selectedTokenAddress,
    // so they remount when the registry resolves — filling before that clears the input.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const grantCard = page.locator(".card", { hasText: "Grant Decryption Access" });
    await grantCard.getByPlaceholder("Delegate address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByRole("button", { name: "Grant Access", exact: true })).toBeEnabled();
  });

  test("Revoke Access is enabled when a valid address is entered", async ({ page }) => {
    // Same guard as Grant Access — wait for stable component state before filling.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const revokeCard = page.locator(".card", { hasText: "Revoke Decryption Access" });
    await revokeCard.getByPlaceholder("Delegate address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByRole("button", { name: "Revoke Access", exact: true })).toBeEnabled();
  });
});

// Exercises sdk.delegations.getStatus() (via useDelegationStatus) through the
// "Decrypt Balance On Behalf Of" card, which is part of the delegate-perspective section.
test.describe("delegation section — status display", () => {
  test("shows an active, permanent delegation with its expiry", async ({
    page,
    mockRpc,
    mockWallet,
  }) => {
    await mockRpc({ delegationExpiry: MAX_UINT64 });
    await mockWallet({
      accounts: [],
      chainId: SEPOLIA_CHAIN_ID_HEX,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();

    // DecryptAsCard is keyed on selectedTokenAddress and remounts once the registry
    // resolves — wait for that before filling, or the input gets cleared underneath us.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const decryptAsCard = page.locator(".card", { hasText: "Decrypt Balance On Behalf Of" });
    await decryptAsCard.getByPlaceholder("Owner address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByText("✓ Delegated · Permanent")).toBeVisible();
  });

  test("shows no active delegation when none exists", async ({ page, mockRpc, mockWallet }) => {
    await mockRpc({ delegationExpiry: 0n });
    await mockWallet({
      accounts: [],
      chainId: SEPOLIA_CHAIN_ID_HEX,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();

    // DecryptAsCard is keyed on selectedTokenAddress and remounts once the registry
    // resolves — wait for that before filling, or the input gets cleared underneath us.
    await expect(page.getByRole("combobox")).not.toHaveValue("");
    const decryptAsCard = page.locator(".card", { hasText: "Decrypt Balance On Behalf Of" });
    await decryptAsCard.getByPlaceholder("Owner address (0x…)").fill(VALID_DELEGATE);
    await expect(page.getByText("No active delegation for this token")).toBeVisible();
  });
});
