import { test, expect, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

test.describe("tabs", () => {
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

  test("opens on the token operations", async ({ page }) => {
    await expect(page.getByRole("tab", { name: "Tokens" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("Shield — ERC-20 → Confidential")).toBeVisible();
    await expect(page.getByText("Delegation — as owner")).toHaveCount(0);
  });

  test("moves delegation to the Delegation tab", async ({ page }) => {
    await page.getByRole("tab", { name: "Delegation" }).click();
    await expect(page.getByText("Delegation — as owner")).toBeVisible();
    await expect(page.getByText("Shield — ERC-20 → Confidential")).toHaveCount(0);
  });

  test("shows a setup hint on the Vaults tab when no vault is configured", async ({ page }) => {
    await page.getByRole("tab", { name: "Vaults" }).click();
    await expect(page.getByText(/No vault is configured for this network/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Confidential token" })).toHaveCount(0);
  });
});
