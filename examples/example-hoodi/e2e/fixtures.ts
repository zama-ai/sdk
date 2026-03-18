import { test as base, expect, type Page } from "@playwright/test";

export const HOODI_CHAIN_ID_HEX = "0x88bb0"; // must match src/lib/config.ts
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
   * Controls how wallet_switchEthereumChain behaves:
   * - "succeed" (default): immediately succeeds and updates chainId to Hoodi.
   * - "reject": always rejects with code 4001 (user rejection) — chainId unchanged.
   */
  switchBehavior?: "succeed" | "reject";
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
 * - `wallet_switchEthereumChain` behavior is controlled by `switchBehavior`.
 * - `window.__setMockChainId(id)` is exposed so tests can update the mock's
 *   returned chainId mid-test (used to simulate a successful network switch
 *   when `switchBehavior: "reject"` is needed to block the auto-switch on load).
 */
export async function mockWallet(page: Page, config: WalletConfig) {
  await page.addInitScript((cfg: WalletConfig) => {
    let chainId = cfg.chainId;
    const behavior = cfg.switchBehavior ?? "succeed";

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
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            if (behavior === "reject") {
              return Promise.reject(Object.assign(new Error("User rejected"), { code: 4001 }));
            }
            chainId = "0x88bb0";
            return Promise.resolve(null);
          case "eth_sendTransaction":
            return Promise.resolve("0x" + "1".repeat(64));
          case "eth_signTypedData_v4":
          case "personal_sign":
          case "eth_sign":
            return Promise.resolve("0x" + "a".repeat(130));
          default:
            return Promise.resolve(null);
        }
      },
      on(_event: string, _listener: unknown) {},
      removeListener(_event: string, _listener: unknown) {},
      emit(_event: string, ..._args: unknown[]) {},
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = mockEthereum;
    // Allow tests to change the mock's returned chainId mid-test.
    // Used to simulate a successful switch without touching switchBehavior.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__setMockChainId = (id: string) => {
      chainId = id;
    };
  }, config);
}

/**
 * Intercepts HTTP requests to the Hoodi RPC endpoint and returns minimal
 * valid JSON-RPC responses. eth_call returns "0x" (empty), which causes
 * useMetadata to fail gracefully — actionsDisabled stays true and the UI
 * shows "—" for balances. This keeps tests focused on structure, not data.
 */
export async function mockRpc(page: Page) {
  await page.route("**/rpc.hoodi.ethpandaops.io**", async (route) => {
    const body = route.request().postDataJSON() as {
      id?: number;
      method?: string;
    } | null;
    const id = body?.id ?? 1;

    const staticResults: Record<string, unknown> = {
      eth_chainId: "0x88bb0",
      eth_blockNumber: "0x1",
      eth_getBalance: "0x0",
      eth_call: "0x",
      eth_getTransactionCount: "0x0",
      eth_estimateGas: "0x5208",
      net_version: "559536",
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

export { base as test, expect };
