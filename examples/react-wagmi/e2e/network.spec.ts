import {
  test,
  expect,
  NETWORKS,
  WRONG_CHAIN_ID,
  SEPOLIA_CHAIN_ID_HEX,
  TEST_ADDRESS,
} from "./fixtures";

// All tests in this suite need to connect first (wagmi does not auto-connect without
// stored localStorage state). The dev server is started by playwright.config.ts with
// MAINNET_RELAYER_URL set, so the picker lists Ethereum mainnet; POLYGON_RELAYER_URL is
// unset, so Polygon mainnet stays hidden.
test.describe("network picker on an unsupported chain", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    // chainId: WRONG_CHAIN_ID → after connecting, the chain is not in the network table
    //   → Screen 2 ("Choose a Network") renders.
    await mockWallet({ accounts: [], chainId: WRONG_CHAIN_ID, requestAccounts: [TEST_ADDRESS] });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
  });

  test("shows the picker with the wallet's chain ID", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Choose a Network" })).toBeVisible();
    await expect(page.getByText(/chain ID 5\b/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Network" })).toHaveValue("");
  });

  test("lists cleartext networks and configured relayer networks only", async ({ page }) => {
    const picker = page.getByRole("combobox", { name: "Network" });
    await expect(picker.locator("option", { hasText: "Sepolia" })).toHaveCount(1);
    await expect(picker.locator("option", { hasText: "BNB Testnet · Cleartext" })).toHaveCount(1);
    await expect(picker.locator("option", { hasText: "Ethereum" })).toHaveCount(1);
    await expect(picker.locator("option", { hasText: /^Polygon$/ })).toHaveCount(0);
  });

  test("switches to Sepolia from the picker", async ({ page }) => {
    // Selecting an option calls useSwitchChain() → wallet_switchEthereumChain → the mock
    // updates chainId + emits chainChanged → wagmi's chainId becomes Sepolia → Screen 3.
    await page.getByRole("combobox", { name: "Network" }).selectOption("sepolia");
    await expect(page.getByText("Balances")).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Network" })).toHaveValue("sepolia");
  });

  test("transitions to main screen when user switches chain in their wallet", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Choose a Network" })).toBeVisible();

    // Simulate the user switching to Sepolia directly in their wallet — fires chainChanged
    // without going through the picker.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, SEPOLIA_CHAIN_ID_HEX);

    await expect(page.getByText("Balances")).toBeVisible();
  });
});

test.describe("mainnet", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc({ network: "mainnet" });
    await mockWallet({
      accounts: [],
      chainId: NETWORKS.mainnet.chainIdHex,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("is selected in the picker and shows the native balance label", async ({ page }) => {
    await expect(page.getByRole("combobox", { name: "Network" })).toHaveValue("mainnet");
    await expect(page.getByText(/ETH:/)).toBeVisible();
  });

  test("hides the mint button and the vault demo", async ({ page }) => {
    // The registry mock returns the same two pairs on every network, so cUSDC (the token
    // the Sepolia vault is bound to) is selected here too — and must not show the vault.
    await expect(page.getByRole("combobox", { name: "Confidential token" })).not.toHaveValue("");
    await expect(page.getByRole("button", { name: /Mint/ })).toHaveCount(0);
    await expect(page.getByText("Reacting contract — ConfidentialVault")).toHaveCount(0);
    await expect(page.getByText("Shield — ERC-20 → Confidential")).toBeVisible();
  });
});

test.describe("chain switch", () => {
  test("does not show the previous chain's ERC-20 balance", async ({
    page,
    mockRpc,
    mockWallet,
  }) => {
    // Sepolia answers balanceOf with 990; mainnet answers "0x", so its read fails. A failed
    // refetch keeps the previous value in TanStack Query, which is why the balance key must
    // carry the chain id — otherwise the Sepolia number would survive the switch.
    await mockRpc({ erc20Balance: 990_000_000n });
    await mockRpc({ network: "mainnet" });
    await mockWallet({
      accounts: [],
      chainId: SEPOLIA_CHAIN_ID_HEX,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
    await expect(page.locator(".balance-value").first()).toHaveText(/990 USDC Mock/);

    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, NETWORKS.mainnet.chainIdHex);

    await expect(page.getByRole("combobox", { name: "Network" })).toHaveValue("mainnet");
    await expect(page.locator(".balance-value").first()).toHaveText("—");
  });
});
