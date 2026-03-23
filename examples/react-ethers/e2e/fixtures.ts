import { test as base, expect, type Page } from "@playwright/test";

export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // must match src/lib/config.ts
export const WRONG_CHAIN_ID = "0x1"; // Ethereum mainnet
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

interface WalletConfig {
  /**
   * Accounts returned by `eth_accounts` (determines auto-connect state on page load).
   * Set to `[]` to show the "Connect Wallet" screen on load.
   */
  accounts: string[];
  chainId: string;
  /**
   * Accounts returned by `eth_requestAccounts` (the "connect wallet" RPC call).
   * Defaults to `accounts`. Set this to provide a different result for the
   * connect flow than what `eth_accounts` returns on page load.
   */
  requestAccounts?: string[];
}

/**
 * Injects a stateful mock EIP-1193 provider into the page before load.
 *
 * Key design decisions:
 * - `eth_accounts` and `eth_requestAccounts` are kept separate so that the SDK
 *   can call `eth_requestAccounts` internally during initialization without
 *   affecting what `eth_accounts` returns to page.tsx's auto-detect useEffect.
 * - `window.__emitChainChanged(chainId)` is exposed so tests can simulate a
 *   user switching networks in their wallet, triggering the `chainChanged` event
 *   that page.tsx listens for to transition between screens.
 */
export async function mockWallet(page: Page, config: WalletConfig) {
  await page.addInitScript((cfg: WalletConfig) => {
    let chainId = cfg.chainId;
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    const mockEthereum = {
      isMetaMask: true,
      request({ method }: { method: string; params?: unknown[] }) {
        switch (method) {
          case "eth_chainId":
            return Promise.resolve(chainId);
          case "eth_accounts":
            // Read-only: returns the configured accounts as they are on page load.
            return Promise.resolve([...cfg.accounts]);
          case "eth_requestAccounts":
            // Connect flow: returns requestAccounts if configured, otherwise accounts.
            return Promise.resolve([...(cfg.requestAccounts ?? cfg.accounts)]);
          case "eth_sendTransaction":
            return Promise.resolve("0x" + "1".repeat(64));
          case "net_version":
            return Promise.resolve("11155111");
          case "eth_blockNumber":
            return Promise.resolve("0x1");
          case "eth_getTransactionReceipt":
          case "eth_getTransactionByHash":
            return Promise.resolve(null);
          case "eth_signTypedData_v4":
          case "personal_sign":
          case "eth_sign":
            return Promise.resolve("0x" + "a".repeat(130));
          default:
            return Promise.resolve(null);
        }
      },
      on(event: string, listener: (...args: unknown[]) => void) {
        (listeners[event] ??= []).push(listener);
      },
      removeListener(event: string, listener: (...args: unknown[]) => void) {
        listeners[event] = (listeners[event] ?? []).filter((l) => l !== listener);
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = mockEthereum;

    // Simulate the user switching networks in their wallet.
    // Fires the chainChanged event that page.tsx listens for to update screen state.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__emitChainChanged = (id: string) => {
      chainId = id;
      for (const listener of listeners["chainChanged"] ?? []) {
        listener(id);
      }
    };
  }, config);
}

/**
 * Intercepts HTTP requests to the Sepolia RPC endpoint and returns minimal
 * valid JSON-RPC responses. eth_call returns "0x" (empty), which causes
 * useMetadata to fail gracefully — actionsDisabled stays true and the UI
 * shows "—" for balances. This keeps tests focused on structure, not data.
 */
export async function mockRpc(page: Page) {
  await page.route("**/ethereum-sepolia-rpc.publicnode.com**", async (route) => {
    const body = route.request().postDataJSON() as {
      id?: number;
      method?: string;
    } | null;
    const id = body?.id ?? 1;

    const staticResults: Record<string, unknown> = {
      eth_chainId: "0xaa36a7",
      eth_blockNumber: "0x1",
      eth_getBalance: "0x0",
      eth_call: "0x",
      eth_getTransactionCount: "0x0",
      eth_estimateGas: "0x5208",
      net_version: "11155111",
    };

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: staticResults[body?.method ?? ""] ?? null,
      }),
    });
  });
}

/**
 * Extends the base test to abort all requests to the local /api/relayer proxy for
 * every test automatically. This prevents real network calls to the Zama relayer
 * in CI — ZamaProvider handles relayer init failure gracefully, and no test here
 * exercises actual FHE operations.
 */
export const test = base.extend<{ _autoMockRelayer: void }>({
  _autoMockRelayer: [
    async ({ page }, use) => {
      await page.route("**/api/relayer/**", (route) => route.abort());
      await use();
    },
    { auto: true },
  ],
});

export { expect };
