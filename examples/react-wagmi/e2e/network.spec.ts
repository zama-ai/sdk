import { test, expect, WRONG_CHAIN_ID, SEPOLIA_CHAIN_ID_HEX, TEST_ADDRESS } from "./fixtures";

// All tests in this suite need to connect first (wagmi does not auto-connect without
// stored localStorage state), then verify wrong-network behavior.
test.describe("wrong network screen", () => {
  test.beforeEach(async ({ page, mockRpc, mockWallet }) => {
    await mockRpc();
    // accounts: [] → shows connect screen on load.
    // chainId: WRONG_CHAIN_ID → after connecting, wagmi reads eth_chainId = WRONG_CHAIN_ID
    //   → chainId !== SEPOLIA_CHAIN_ID → Screen 2 ("Sepolia Network Required") renders.
    await mockWallet({
      accounts: [],
      chainId: WRONG_CHAIN_ID,
      requestAccounts: [TEST_ADDRESS],
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Connect Wallet" }).click({ force: true });
  });

  test("shows wrong network screen when connected on wrong chain", async ({ page }) => {
    await expect(page.getByText("Sepolia Network Required")).toBeVisible();
  });

  test("shows chain ID in wrong network message", async ({ page }) => {
    // The page embeds the numeric chain ID (11155111) in the wrong-network message.
    await expect(page.getByText(/11155111/)).toBeVisible();
  });

  test("transitions to main screen when switching to Sepolia", async ({ page }) => {
    await expect(page.getByText("Sepolia Network Required")).toBeVisible();

    // Click "Switch to Sepolia" — calls useSwitchChain() → wallet_switchEthereumChain →
    // mock updates chainId + emits chainChanged → wagmi's useChainId() returns SEPOLIA_CHAIN_ID
    // → isSepolia becomes true → Screen 3 renders.
    await page.getByRole("button", { name: "Switch to Sepolia" }).click({ force: true });

    await expect(page.getByText("Balances")).toBeVisible();
  });

  test("transitions to main screen when user switches chain in their wallet", async ({ page }) => {
    await expect(page.getByText("Sepolia Network Required")).toBeVisible();

    // Simulate the user switching to Sepolia directly in their wallet — fires chainChanged
    // without going through the "Switch to Sepolia" button.
    await page.evaluate((chainId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__emitChainChanged(chainId);
    }, SEPOLIA_CHAIN_ID_HEX);

    await expect(page.getByText("Balances")).toBeVisible();
  });
});
