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
}

export interface RpcOptions {
  /**
   * When true, the registry mock returns 0 pairs (length = 0).
   * The UI will show "No tokens available." and all action buttons will be disabled.
   */
  emptyRegistry?: boolean;
}

// ── ABI encoding helpers (Node.js) ────────────────────────────────────────────
// These run in the Playwright test process — Buffer and standard Node APIs are available.

/** Encode a non-negative integer as a 32-byte big-endian hex word (no 0x prefix). */
function abiU256(n: number | bigint): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

/** Encode a 20-byte Ethereum address as a 32-byte ABI word (no 0x prefix). */
function abiAddr(a: string): string {
  return a.slice(2).toLowerCase().padStart(64, "0");
}

/** Encode a boolean as a 32-byte ABI word (no 0x prefix). */
function abiBool(b: boolean): string {
  return (b ? "1" : "0").padStart(64, "0");
}

/**
 * ABI-encode a UTF-8 string as a `string` dynamic type:
 *   [offset=32][length][data padded to next 32-byte boundary]
 */
function abiStr(s: string): string {
  const buf = Buffer.from(s, "utf8");
  const hex = buf.toString("hex");
  const padded = hex.padEnd(Math.ceil(buf.length / 32) * 64, "0");
  return "0x" + abiU256(32) + abiU256(buf.length) + padded;
}

// ── Mock contract addresses (lowercase for case-insensitive comparison) ───────

const REGISTRY = REGISTRY_ADDRESS.toLowerCase();

const T1 = MOCK_TOKEN1_ADDRESS.toLowerCase();
const CT1 = MOCK_CTOKEN1_ADDRESS.toLowerCase();
const T2 = MOCK_TOKEN2_ADDRESS.toLowerCase();
const CT2 = MOCK_CTOKEN2_ADDRESS.toLowerCase();

const TOKEN_META: Record<string, { name: string; symbol: string; decimals: number }> = {
  [T1]: { name: "USD Coin Mock", symbol: "USDC Mock", decimals: 6 },
  [CT1]: { name: "Confidential USD Coin", symbol: "cUSDC", decimals: 6 },
  [T2]: { name: "Tether USD Mock", symbol: "USDT Mock", decimals: 6 },
  [CT2]: { name: "Confidential Tether USD", symbol: "cUSDT", decimals: 6 },
};

/**
 * Route a single `eth_call` request to the correct ABI-encoded response.
 *
 * For react-wagmi, ALL contract reads (useListPairs, useReadContract, etc.) go
 * through the wagmi HTTP transport — not through window.ethereum. This is the
 * opposite of react-ethers (EthersSigner routes reads through BrowserProvider →
 * window.ethereum). Routing happens here in interceptRpc, not in injectMockWallet.
 */
function resolveEthCall(params: unknown[] | undefined, options: RpcOptions): string {
  const [tx = {}] = (params ?? []) as Array<{ to?: string; data?: string }>;
  const to = (tx.to ?? "").toLowerCase();
  const sel = (tx.data ?? "").slice(0, 10).toLowerCase();

  if (to === REGISTRY) {
    // getTokenConfidentialTokenPairsLength() → uint256
    if (sel === "0x483cdcf4") {
      return "0x" + abiU256(options.emptyRegistry ? 0 : 2);
    }
    // getTokenConfidentialTokenPairsSlice(uint256,uint256) → tuple[]
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

  // Token metadata: name(), symbol(), decimals()
  // Called by the SDK on both underlying and confidential token addresses.
  const meta = TOKEN_META[to];
  if (meta) {
    if (sel === "0x06fdde03") return abiStr(meta.name); // name()
    if (sel === "0x95d89b41") return abiStr(meta.symbol); // symbol()
    if (sel === "0x313ce567") return "0x" + abiU256(meta.decimals); // decimals()
  }
  // totalSupply() — called on the underlying ERC-20; returns uint256
  if (sel === "0x18160ddd") return "0x" + abiU256(0);
  // inferredTotalSupply() — called on confidential wrappers; returns uint256
  if (sel === "0xf89d30b1") return "0x" + abiU256(0);

  // All other eth_call requests (e.g. balanceOf) return empty data,
  // causing the caller to fail gracefully (query error → "—" in UI).
  return "0x";
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
 * - NOTE: eth_call is NOT routed here. For react-wagmi, all contract reads
 *   (useListPairs, useReadContract, etc.) go through the wagmi HTTP transport,
 *   not window.ethereum. Registry and metadata mocking happens in interceptRpc.
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
 * valid JSON-RPC responses.
 *
 * eth_call is routed by contract address and function selector so that
 * useListPairs resolves with two token pairs in tests. All other eth_call
 * requests (e.g. balanceOf) return "0x", causing the corresponding queries
 * to fail gracefully and display "—" in the UI.
 *
 * For react-wagmi, ALL contract reads go through this HTTP transport — unlike
 * react-ethers where EthersSigner routes reads through BrowserProvider(window.ethereum).
 */
async function interceptRpc(page: Page, options: RpcOptions = {}) {
  await page.route("**/ethereum-sepolia-rpc.publicnode.com**", async (route) => {
    const body = route.request().postDataJSON() as
      | { id?: number; method?: string; params?: unknown[] }
      | { id?: number; method?: string; params?: unknown[] }[]
      | null;

    function respond(req: { id?: number; method?: string; params?: unknown[] } | null) {
      let result: unknown = null;
      switch (req?.method) {
        case "eth_chainId":
          result = "0xaa36a7";
          break;
        case "eth_blockNumber":
          result = "0x1";
          break;
        case "eth_getBalance":
          result = "0x0";
          break;
        case "eth_getTransactionCount":
          result = "0x0";
          break;
        case "eth_estimateGas":
          result = "0x5208";
          break;
        case "net_version":
          result = "11155111";
          break;
        case "eth_call":
          result = resolveEthCall(req.params, options);
          break;
        default:
          result = null;
      }
      return { jsonrpc: "2.0", id: req?.id ?? 1, result };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // viem may send batch requests (array of JSON-RPC objects) — handle both forms.
      body: JSON.stringify(Array.isArray(body) ? body.map(respond) : respond(body)),
    });
  });
}

interface TestFixtures {
  /** Call with a WalletConfig to inject a mock EIP-1193 provider before page load. */
  mockWallet: (config: WalletConfig) => Promise<void>;
  /** Call to intercept Sepolia RPC requests with registry and metadata mocking. */
  mockRpc: (options?: RpcOptions) => Promise<void>;
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
    await use((options?: RpcOptions) => interceptRpc(page, options));
  },
});

export { expect };
