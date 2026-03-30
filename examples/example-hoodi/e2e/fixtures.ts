import { test as base, expect, type Page } from "@playwright/test";

export const HOODI_CHAIN_ID_HEX = "0x88bb0"; // 560048 in hex — Hoodi chain ID
export const WRONG_CHAIN_ID = "0x1"; // Ethereum mainnet — used for wrong-network tests
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// On-chain WrappersRegistry address for Hoodi (DefaultRegistryAddresses).
export const REGISTRY_ADDRESS = "0x1807aE2f693F8530DFB126D0eF98F2F2518F292f";

// Mock ERC-20 and confidential token addresses returned by the registry mock.
// All-digit addresses avoid EIP-55 checksum ambiguity (digits are case-neutral).
export const MOCK_TOKEN1_ADDRESS = "0x1111111111111111111111111111111111111111";
export const MOCK_CTOKEN1_ADDRESS = "0x2222222222222222222222222222222222222222";
export const MOCK_TOKEN2_ADDRESS = "0x3333333333333333333333333333333333333333";
export const MOCK_CTOKEN2_ADDRESS = "0x4444444444444444444444444444444444444444";

export interface WalletConfig {
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

export interface RpcOptions {
  /**
   * When true, the registry mock returns 0 pairs (length = 0).
   * The UI will show "No tokens available." and all action buttons will be disabled.
   *
   * Note: in the hoodi app, eth_call is NOT routed through window.ethereum — the hybrid
   * provider sends all contract reads directly to the Hoodi HTTP RPC. The emptyRegistry
   * flag is therefore on RpcOptions (not WalletConfig) so the RPC interceptor can handle it.
   */
  emptyRegistry?: boolean;
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
 * - `window.__emitAccountsChanged(accounts)` is exposed so tests can simulate a
 *   user switching accounts, triggering the `accountsChanged` event that
 *   providers.tsx listens for to remount ZamaProvider with the new account.
 * - `eth_sign`/`personal_sign`/`eth_signTypedData_v4` return a 65-byte hex string
 *   (32 bytes r + 32 bytes s + 1 byte v = ECDSA signature).
 * - `eth_call` is NOT handled here — the hybrid provider in providers.tsx routes
 *   all contract reads (eth_call, eth_estimateGas) directly to the Hoodi HTTP RPC,
 *   bypassing window.ethereum. Registry reads and token metadata are therefore
 *   intercepted in `mockRpc`, not here.
 */
async function injectMockWallet(page: Page, config: WalletConfig) {
  await page.addInitScript((cfg: WalletConfig) => {
    let chainId = cfg.chainId;
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

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
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            chainId = "0x88bb0";
            return Promise.resolve(null);
          case "eth_sendTransaction":
            return Promise.resolve("0x" + "1".repeat(64));
          case "net_version":
            return Promise.resolve("560048");
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

    // Simulate the user switching accounts in their wallet.
    // Fires the accountsChanged event that providers.tsx listens for to remount ZamaProvider
    // with a fresh EthersSigner bound to the new account.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__emitAccountsChanged = (accounts: string[]) => {
      for (const listener of listeners["accountsChanged"] ?? []) {
        listener(accounts);
      }
    };
  }, config);
}

/**
 * Intercepts HTTP requests to the Hoodi RPC endpoint and returns minimal
 * valid JSON-RPC responses.
 *
 * In the hoodi app, the hybrid EIP-1193 provider routes all eth_call and
 * eth_estimateGas requests directly to the Hoodi HTTP RPC — bypassing
 * window.ethereum. This means registry reads (getTokenConfidentialTokenPairsLength /
 * getTokenConfidentialTokenPairsSlice) and token metadata (name/symbol/decimals)
 * must be handled here with ABI-encoded responses so useListPairs resolves in tests.
 *
 * All other eth_call requests (e.g. balanceOf) return "0x" (empty data), causing
 * the corresponding queries to fail gracefully and display "—" in the UI.
 */
async function interceptRpc(page: Page, options: RpcOptions = {}) {
  await page.route("**/rpc.hoodi.ethpandaops.io**", async (route) => {
    const body = route.request().postDataJSON() as
      | { id?: number; method?: string }
      | { id?: number; method?: string }[]
      | null;

    // ── ABI encoding helpers ─────────────────────────────────────────────
    // These run in the Node.js test process; no browser sandbox.

    /** Encode a non-negative integer as a 32-byte big-endian hex word (no 0x prefix). */
    const abiU256 = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");

    /** Encode a 20-byte Ethereum address as a 32-byte ABI word (no 0x prefix). */
    const abiAddr = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");

    /** Encode a boolean as a 32-byte ABI word (no 0x prefix). */
    const abiBool = (b: boolean) => (b ? "1" : "0").padStart(64, "0");

    /**
     * ABI-encode a UTF-8 string as a `string` dynamic type:
     *   [offset=32][length][data padded to next 32-byte boundary]
     */
    const abiStr = (s: string): string => {
      const bytes = Array.from(new TextEncoder().encode(s));
      const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
      const padded = hex.padEnd(Math.ceil(bytes.length / 32) * 64, "0");
      return "0x" + abiU256(32) + abiU256(bytes.length) + padded;
    };

    // ── Mock contract addresses ──────────────────────────────────────────
    // Derive from the module-level exported constants — single source of truth.

    /** Hoodi WrappersRegistry — lowercased for comparison with request `to` fields. */
    const REGISTRY = REGISTRY_ADDRESS.toLowerCase();

    /** Mock token pair addresses (all-digit = checksum-neutral, no case conversion needed). */
    const T1 = MOCK_TOKEN1_ADDRESS;
    const CT1 = MOCK_CTOKEN1_ADDRESS;
    const T2 = MOCK_TOKEN2_ADDRESS;
    const CT2 = MOCK_CTOKEN2_ADDRESS;

    const TOKEN_META: Record<string, { name: string; symbol: string; decimals: number }> = {
      [T1]: { name: "USD Coin Mock", symbol: "USDC Mock", decimals: 6 },
      [CT1]: { name: "Confidential USD Coin", symbol: "cUSDC", decimals: 6 },
      [T2]: { name: "Tether USD Mock", symbol: "USDT Mock", decimals: 6 },
      [CT2]: { name: "Confidential Tether USD", symbol: "cUSDT", decimals: 6 },
    };

    const staticResults: Record<string, unknown> = {
      eth_chainId: "0x88bb0",
      eth_blockNumber: "0x1",
      eth_getBalance: "0x0",
      eth_getTransactionCount: "0x0",
      eth_estimateGas: "0x5208",
      net_version: "560048",
    };

    function resolveEthCall(req: { to?: string; data?: string }): string {
      const to = (req.to ?? "").toLowerCase();
      const sel = (req.data ?? "").slice(0, 10).toLowerCase();

      if (to === REGISTRY) {
        // getTokenConfidentialTokenPairsLength() → uint256
        if (sel === "0x483cdcf4") {
          return "0x" + abiU256(options.emptyRegistry ? 0 : 2);
        }
        // getTokenConfidentialTokenPairsSlice(uint256,uint256) → tuple[]
        // Returns (address tokenAddress, address confidentialTokenAddress, bool isValid)[]
        if (sel === "0x90c60535") {
          if (options.emptyRegistry) {
            // ABI encoding of empty tuple[]: offset + length=0
            return "0x" + abiU256(32) + abiU256(0);
          }
          return (
            "0x" +
            abiU256(32) + // offset to array data
            abiU256(2) + // array length
            abiAddr(T1) +
            abiAddr(CT1) +
            abiBool(true) + // pair[0]
            abiAddr(T2) +
            abiAddr(CT2) +
            abiBool(true) // pair[1]
          );
        }
      }

      // Token metadata: name(), symbol(), decimals(), totalSupply()
      // Called by the SDK on both underlying and confidential token addresses.
      const meta = TOKEN_META[to];
      if (meta) {
        if (sel === "0x06fdde03") return abiStr(meta.name); // name()
        if (sel === "0x95d89b41") return abiStr(meta.symbol); // symbol()
        if (sel === "0x313ce567") return "0x" + abiU256(meta.decimals); // decimals()
      }
      // totalSupply() — called only on the underlying ERC-20; returns uint256
      if (sel === "0x18160ddd") return "0x" + abiU256(0);

      // All other eth_call requests (e.g. balanceOf) return empty data,
      // causing the caller to fail gracefully (query error → "—" in UI).
      return "0x";
    }

    function respond(req: { id?: number; method?: string; params?: unknown[] } | null) {
      if (!req) return { jsonrpc: "2.0", id: 1, result: null };
      if (req.method === "eth_call") {
        const [tx = {}] = (req.params ?? []) as Array<{ to?: string; data?: string }>;
        return { jsonrpc: "2.0", id: req.id ?? 1, result: resolveEthCall(tx) };
      }
      return {
        jsonrpc: "2.0",
        id: req.id ?? 1,
        result: staticResults[req.method ?? ""] ?? null,
      };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // ethers may send batch requests (array of JSON-RPC objects) — handle both forms.
      body: JSON.stringify(Array.isArray(body) ? body.map(respond) : respond(body)),
    });
  });
}

interface TestFixtures {
  /** Call with a WalletConfig to inject a mock EIP-1193 provider before page load. */
  mockWallet: (config: WalletConfig) => Promise<void>;
  /** Call to intercept Hoodi RPC requests with static responses. */
  mockRpc: (options?: RpcOptions) => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  mockWallet: async ({ page }, use) => {
    await use((config: WalletConfig) => injectMockWallet(page, config));
  },
  mockRpc: async ({ page }, use) => {
    await use((options?: RpcOptions) => interceptRpc(page, options));
  },
});

export { expect };
