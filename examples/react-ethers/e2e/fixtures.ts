import { test as base, expect, type Page } from "@playwright/test";

export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // 11155111 in hex — Sepolia chain ID
export const WRONG_CHAIN_ID = "0x1"; // Ethereum mainnet — used for wrong-network tests
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// On-chain WrappersRegistry address for Sepolia (DefaultRegistryAddresses).
export const REGISTRY_ADDRESS = "0x2f0750Bbb0A246059d80e94c454586a7F27a128e";

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
  /**
   * When true, the registry mock returns 0 pairs (length = 0).
   * The UI will show "No tokens available." and all action buttons will be disabled.
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
 * - `eth_call` routes registry reads (getTokenConfidentialTokenPairsLength /
 *   getTokenConfidentialTokenPairsSlice) and token metadata (name/symbol/decimals/
 *   totalSupply) through hand-written ABI encoding so useListPairs resolves in tests.
 *   All other eth_call requests return "0x" (empty data), causing the corresponding
 *   queries (e.g. balanceOf) to fail gracefully and display "—" in the UI.
 */
async function injectMockWallet(page: Page, config: WalletConfig) {
  await page.addInitScript((cfg: WalletConfig) => {
    let chainId = cfg.chainId;
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    // ── ABI encoding helpers ───────────────────────────────────────────────
    // These run in the browser; no external imports available.

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

    // ── Mock contract addresses ────────────────────────────────────────────

    /** Sepolia WrappersRegistry — DefaultRegistryAddresses. */
    const REGISTRY = "0x2f0750bbb0a246059d80e94c454586a7f27a128e";

    /** Mock token pair addresses (all-digit = checksum-neutral). */
    const T1 = "0x1111111111111111111111111111111111111111";
    const CT1 = "0x2222222222222222222222222222222222222222";
    const T2 = "0x3333333333333333333333333333333333333333";
    const CT2 = "0x4444444444444444444444444444444444444444";

    const TOKEN_META: Record<string, { name: string; symbol: string; decimals: number }> = {
      [T1]: { name: "USD Coin Mock", symbol: "USDC Mock", decimals: 6 },
      [CT1]: { name: "Confidential USD Coin", symbol: "cUSDC", decimals: 6 },
      [T2]: { name: "Tether USD Mock", symbol: "USDT Mock", decimals: 6 },
      [CT2]: { name: "Confidential Tether USD", symbol: "cUSDT", decimals: 6 },
    };

    // ── Mock EIP-1193 provider ─────────────────────────────────────────────

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

          case "eth_call": {
            // EthersSigner.readContract routes through BrowserProvider(window.ethereum).
            // We handle registry reads and token metadata here so that useListPairs
            // resolves correctly in tests without a live Sepolia connection.
            const [tx = {}] = (params ?? []) as Array<{ to?: string; data?: string }>;
            const to = (tx.to ?? "").toLowerCase();
            const sel = (tx.data ?? "").slice(0, 10).toLowerCase();

            if (to === REGISTRY) {
              // getTokenConfidentialTokenPairsLength() → uint256
              if (sel === "0x483cdcf4") {
                return Promise.resolve("0x" + abiU256(cfg.emptyRegistry ? 0 : 2));
              }
              // getTokenConfidentialTokenPairsSlice(uint256,uint256) → tuple[]
              // Returns (address tokenAddress, address confidentialTokenAddress, bool isValid)[]
              if (sel === "0x90c60535") {
                if (cfg.emptyRegistry) {
                  // ABI encoding of empty tuple[]: offset + length=0
                  return Promise.resolve("0x" + abiU256(32) + abiU256(0));
                }
                return Promise.resolve(
                  "0x" +
                    abiU256(32) + // offset to array data
                    abiU256(2) + // array length
                    abiAddr(T1) +
                    abiAddr(CT1) +
                    abiBool(true) + // pair[0]
                    abiAddr(T2) +
                    abiAddr(CT2) +
                    abiBool(true), // pair[1]
                );
              }
            }

            // Token metadata: name(), symbol(), decimals()
            // Called by the SDK on both underlying and confidential token addresses.
            const meta = TOKEN_META[to];
            if (meta) {
              if (sel === "0x06fdde03") return Promise.resolve(abiStr(meta.name)); // name()
              if (sel === "0x95d89b41") return Promise.resolve(abiStr(meta.symbol)); // symbol()
              if (sel === "0x313ce567") return Promise.resolve("0x" + abiU256(meta.decimals)); // decimals()
            }
            // totalSupply() — called on the underlying ERC-20; returns uint256
            if (sel === "0x18160ddd") return Promise.resolve("0x" + abiU256(0));
            // inferredTotalSupply() — called on confidential wrappers; returns uint256
            if (sel === "0xf89d30b1") return Promise.resolve("0x" + abiU256(0));

            // All other eth_call requests (e.g. balanceOf) return empty data,
            // causing the caller to fail gracefully (query error → "—" in UI).
            return Promise.resolve("0x");
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
 * Intercepts HTTP requests to the Sepolia RPC endpoint and returns minimal
 * valid JSON-RPC responses. Used by the JsonRpcProvider in page.tsx that reads
 * ETH balances directly from publicnode.com (bypassing window.ethereum).
 * Contract reads made through EthersSigner.readContract go through window.ethereum
 * (BrowserProvider) instead — those are handled by the mock wallet above.
 */
async function interceptRpc(page: Page) {
  await page.route("**/ethereum-sepolia-rpc.publicnode.com**", async (route) => {
    const body = route.request().postDataJSON() as
      | { id?: number; method?: string }
      | { id?: number; method?: string }[]
      | null;

    const staticResults: Record<string, unknown> = {
      eth_chainId: "0xaa36a7",
      eth_blockNumber: "0x1",
      eth_getBalance: "0x0",
      eth_call: "0x",
      eth_getTransactionCount: "0x0",
      eth_estimateGas: "0x5208",
      net_version: "11155111",
    };

    function respond(req: { id?: number; method?: string } | null) {
      return { jsonrpc: "2.0", id: req?.id ?? 1, result: staticResults[req?.method ?? ""] ?? null };
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
  /** Call to intercept Sepolia RPC requests with static responses. */
  mockRpc: () => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  // Override the page fixture to abort all /api/relayer requests for every test automatically.
  // This prevents real network calls to the Zama relayer in CI — ZamaProvider handles
  // relayer init failure gracefully, and no test here exercises actual FHE operations.
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
