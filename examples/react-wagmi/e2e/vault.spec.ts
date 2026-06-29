import {
  test,
  expect,
  SEPOLIA_CHAIN_ID_HEX,
  TEST_ADDRESS,
  MOCK_CTOKEN1_ADDRESS,
  MOCK_CTOKEN2_ADDRESS,
} from "./fixtures";

// The ConfidentialVault demo (confidentialTransferAndCall) is bound to one confidential
// token. playwright.config.ts sets NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN to the mocked cUSDC
// pair (MOCK_CTOKEN1_ADDRESS), so the vault cards render when cUSDC is the selected token.
//
// These tests exercise the rendered states only — the relayer is aborted in this harness,
// so no real encryption/decryption runs (same constraint as the other react-wagmi e2e specs).
test.describe("confidential vault — confidentialTransferAndCall", () => {
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
    // cUSDC (MOCK_CTOKEN1) is the auto-selected first pair.
    await expect(page.getByRole("combobox")).toHaveValue(MOCK_CTOKEN1_ADDRESS);
  });

  test("renders the vault section for the bound token", async ({ page }) => {
    await expect(page.getByText("Reacting contract — ConfidentialVault")).toBeVisible();
    await expect(
      page.getByText("Deposit into Vault — confidentialTransferAndCall"),
    ).toBeVisible();
    await expect(page.getByText("Your Vault Position")).toBeVisible();
  });

  test("beneficiary defaults to the connected wallet", async ({ page }) => {
    await expect(page.getByTestId("vault-beneficiary-input")).toHaveValue(TEST_ADDRESS);
  });

  test("deposit is gated until the balance is decrypted", async ({ page }) => {
    await page.getByTestId("vault-amount-input").fill("5");
    // No permit is granted in the mocked harness, so the deposit stays disabled and the
    // hint is shown.
    await expect(page.getByTestId("vault-deposit-button")).toBeDisabled();
    await expect(page.getByText("Decrypt your balance first to enable deposits.")).toBeVisible();
  });

  test("shows no position before any deposit", async ({ page }) => {
    await expect(page.getByTestId("vault-no-position")).toBeVisible();
  });

  test("hides the vault section for an unbound token", async ({ page }) => {
    await page.getByRole("combobox").selectOption(MOCK_CTOKEN2_ADDRESS);
    await expect(page.getByText("Reacting contract — ConfidentialVault")).toBeHidden();
    await expect(
      page.getByText("Deposit into Vault — confidentialTransferAndCall"),
    ).toBeHidden();
  });
});
