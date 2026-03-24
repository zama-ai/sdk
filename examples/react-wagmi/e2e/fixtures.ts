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
 * - `eth_accounts` and `eth_requestAccounts` are kept separate so that wagmi's
 *   auto-reconnect path (eth_accounts) and explicit connect (eth_requestAccounts)
 *   can behave independently.
 * - `wallet_switchEthereumChain` updates the internal chainId state and emits
 *   `chainChanged` so wagmi's `useChainId()` updates reactively — without this,
 *   clicking "Switch to Sepolia" would not transition from Screen 2 to Screen 3.
 * - `window.__emitChainChanged(chainId)` is exposed so tests can simulate a
 *   user switching networks in their wallet without going through the switch button.
 * - `eth_sign`/`personal_sign`/`eth_signTypedData_v4` return a 65-byte hex string
 *   (32 bytes r + 32 bytes s + 1 byte v = ECDSA signature).
 */
async function injectMockWallet(page: Page, config: WalletConfig) {
  await page.addInitScript((cfg: WalletConfig) => {
    let chainId = cfg.chainId;
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    function emit(event: string, ...args: unknown[]) {
      for (const listener of listeners[event] ?? []) {
        listener(...args);
      }
    }

    const mockEthereum = {
      isMetaMask: true,
      request({ method, params }: { method: string; params?: unknown[] }) {
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
            // 65 bytes = ECDSA signature (32 bytes r + 32 bytes s + 1 byte v)
            return Promise.resolve("0x" + "a".repeat(130));
          case "wallet_switchEthereumChain": {
            // Update chainId state and emit chainChanged so wagmi's useChainId()
            // updates reactively after useSwitchChain() is called.
            const newChainId = (params as [{ chainId: string }])[0].chainId;
            chainId = newChainId;
            // setTimeout(0) defers the event so the Promise resolves before wagmi
            // processes the chainChanged event — mirrors real wallet behavior.
            setTimeout(() => emit("chainChanged", newChainId), 0);
            return Promise.resolve(null);
          }
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

    // Simulate the user switching networks in their wallet externally (without clicking
    // the switch button). Useful for network.spec tests that verify chainChanged handling.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__emitChainChanged = (id: string) => {
      chainId = id;
      emit("chainChanged", id);
    };
  }, config);
}

/**
 * Intercepts HTTP requests to the Sepolia RPC endpoint and returns minimal
 * valid JSON-RPC responses. eth_call returns "0x" (empty), which causes
 * useMetadata to fail gracefully — actionsDisabled stays true and the UI
 * shows "—" for balances. This keeps tests focused on structure, not data.
 */
async function interceptRpc(page: Page) {
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

interface TestFixtures {
  mockWallet: (config: WalletConfig) => Promise<void>;
  mockRpc: () => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  // Auto-abort all relayer requests for every test — no real FHE operations in these tests.
  page: async ({ page }, use) => {
    await page.route("**/api/relayer/**", (route) => route.abort());
    await use(page);
  },
  mockWallet: async ({ page }, use) => {
    await use((config: WalletConfig) => injectMockWallet(page, config));
  },
  mockRpc: async ({ page }, use) => {
    await use(() => interceptRpc(page));
  },
});

export { expect };
