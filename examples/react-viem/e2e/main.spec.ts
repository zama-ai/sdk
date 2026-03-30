import {
  test,
  expect,
  SEPOLIA_CHAIN_ID_HEX,
  TEST_ADDRESS,
  MOCK_CTOKEN1_ADDRESS,
  MOCK_CTOKEN2_ADDRESS,
} from "./fixtures";

// All tests in this suite start with the wallet already connected on Sepolia.
// The mock RPC returns ABI-encoded registry data so that useListPairs resolves
// with two token pairs (USDC Mock / USDT Mock).
test.describe("main screen", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: SEPOLIA_CHAIN_ID_HEX });
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

  test("shows token selector populated from the registry", async ({ page }) => {
    // useListPairs resolves via the mock RPC eth_call handler — wait for the registry
    // to load before asserting option content.
    const select = page.getByRole("combobox");
    await expect(select).toBeVisible();
    await expect(select.locator("option", { hasText: "USDC Mock" })).toHaveCount(1);
    await expect(select.locator("option", { hasText: "USDT Mock" })).toHaveCount(1);
  });

  test("switching token updates the selector value", async ({ page }) => {
    const select = page.getByRole("combobox");
    // Wait for registry to load and the first cToken address to be auto-selected.
    await expect(select).toHaveValue(MOCK_CTOKEN1_ADDRESS);
    await select.selectOption(MOCK_CTOKEN2_ADDRESS);
    await expect(select).toHaveValue(MOCK_CTOKEN2_ADDRESS);
  });

  test("shows dash for ERC-20 and confidential balances when data unavailable", async ({
    page,
  }) => {
    // balanceOf for the selected token returns "0x" (empty data) from the mock —
    // the query throws on ABI decode → erc20Balance stays undefined → formattedErc20 = "—".
    // Confidential balance is not queried (isAllowed = false); the "Decrypt Balance"
    // button is shown instead, so .balance-value elements represent ERC-20 only.
    const balanceValues = page.locator(".balance-value");
    // At least one balance value must be "—".
    await expect(balanceValues.first()).toBeVisible();
    const texts = await balanceValues.allTextContents();
    const hasDash = texts.some((t) => t.includes("—"));
    expect(hasDash).toBe(true);
  });

  test("ETH balance shows in header", async ({ page }) => {
    // ETH row is always rendered; shows "—" until the query resolves.
    await expect(page.getByText(/ETH:/)).toBeVisible();
  });

  test("no pending unshield card shown on fresh load", async ({ page }) => {
    // IndexedDB is empty in a fresh browser context — no PendingUnshieldCard renders.
    await expect(page.getByText(/Pending Unshield/)).not.toBeVisible();
  });

  test("mint button is enabled once the registry loads a token", async ({ page }) => {
    // actionsDisabled = !isSepolia || !token. Once the first pair is auto-selected,
    // actionsDisabled = false. Mint has no additional input conditions and transitions
    // directly from disabled to enabled.
    await expect(page.getByRole("button", { name: /Mint/ })).toBeEnabled();
  });
});

// Tests for the registry empty state — simulates a registry that has no valid pairs.
test.describe("registry empty state", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc({ emptyRegistry: true });
    await mockWallet({ accounts: [TEST_ADDRESS], chainId: SEPOLIA_CHAIN_ID_HEX });
    await page.goto("/");
  });

  test("shows no tokens available when registry returns no pairs", async ({ page }) => {
    await expect(page.getByText("No tokens available.")).toBeVisible();
  });

  test("action buttons are disabled when no tokens are available", async ({ page }) => {
    // !token → actionsDisabled = true for all primary action buttons.
    await expect(page.getByRole("button", { name: "Shield", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Transfer", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Unshield", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: /Mint/ })).toBeDisabled();
  });
});
