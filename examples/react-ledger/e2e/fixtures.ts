import { test as base, expect, type Page } from "@playwright/test";

export const HOODI_CHAIN_ID_HEX = "0x88bb0"; // 560048 in hex — Hoodi chain ID
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// A second address used for delegation tests (different from TEST_ADDRESS).
export const DELEGATE_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";

// On-chain WrappersRegistry address for Hoodi (DefaultRegistryAddresses).
export const REGISTRY_ADDRESS = "0x1807aE2f693F8530DFB126D0eF98F2F2518F292f";

// Mock token pair addresses returned by the registry mock.
// All-digit addresses avoid EIP-55 checksum ambiguity.
export const MOCK_TOKEN1_ADDRESS = "0x1111111111111111111111111111111111111111";
export const MOCK_CTOKEN1_ADDRESS = "0x2222222222222222222222222222222222222222";
export const MOCK_TOKEN2_ADDRESS = "0x3333333333333333333333333333333333333333";
export const MOCK_CTOKEN2_ADDRESS = "0x4444444444444444444444444444444444444444";

export interface LedgerConfig {
  /** Ethereum address the mock Ledger will return for the connected account. */
  address: string;
}

export interface RpcOptions {
  /**
   * When true, the registry mock returns 0 pairs (length = 0).
   * The UI will show "No tokens available." and all action buttons will be disabled.
   */
  emptyRegistry?: boolean;
}

/**
 * Overrides LedgerWebHIDProvider.connect() on the window.__ledgerProvider singleton
 * so tests can simulate a successful Ledger connection without opening a real WebHID
 * device picker.
 *
 * Key design decisions:
 * - window.__ledgerProvider is exposed by LedgerWebHIDProvider in non-production builds.
 * - connect() is replaced to immediately set _address and fire "accountsChanged",
 *   which triggers page.tsx's connect() to read chainId and update React state.
 * - verifyAddress() is replaced with a no-op so tests that trigger it don't hang
 *   waiting for a physical device confirmation.
 * - The function waits for __ledgerProvider to be available before running, because
 *   the module initialises asynchronously after page load.
 *
 * This is called AFTER page.goto() — the singleton must exist before we can override it.
 * Click the "Connect Ledger" button AFTER calling mockLedger() to trigger page.tsx's
 * connect() path, which calls our mocked ledgerProvider.connect() and sets React state.
 */
async function overrideLedgerConnect(page: Page, config: LedgerConfig) {
  await page.waitForFunction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => !!(window as any).__ledgerProvider,
    { timeout: 10_000 },
  );
  await page.evaluate((cfg) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (window as any).__ledgerProvider;

    // Replace connect() — bypass WebHID hardware access.
    p.connect = async (accountIndex = 0) => {
      p._path = `44'/60'/0'/0/${accountIndex}`;
      p._address = cfg.address;
      p._fire("accountsChanged", [[cfg.address]]);
      return cfg.address;
    };

    // Replace verifyAddress() — no physical device confirmation needed in tests.
    p.verifyAddress = async () => {
      /* no-op */
    };
  }, config);
}

/**
 * Simulates the Ledger device being unplugged mid-session by calling _onDisconnect()
 * on the provider singleton. This resets _address/transport and fires "accountsChanged"
 * (with []) and "disconnect" events, causing page.tsx to return to the connect screen.
 */
async function triggerLedgerDisconnect(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__ledgerProvider._onDisconnect();
  });
}

/**
 * Intercepts HTTP requests to the Hoodi RPC endpoint and returns minimal valid
 * JSON-RPC responses.
 *
 * In react-ledger, all read-only calls (eth_call, eth_estimateGas) are routed
 * directly to the Hoodi HTTP RPC by LedgerWebHIDProvider and by the direct
 * rpcProvider in page.tsx. This interceptor handles both paths.
 *
 * The WrappersRegistry reads (getTokenConfidentialTokenPairsLength / Slice) are
 * ABI-encoded here so useListPairs resolves in tests and the token selector renders.
 */
async function interceptRpc(page: Page, options: RpcOptions = {}) {
  await page.route("**/rpc.hoodi.ethpandaops.io**", async (route) => {
    const body = route.request().postDataJSON() as
      | { id?: number; method?: string; params?: unknown[] }
      | { id?: number; method?: string; params?: unknown[] }[]
      | null;

    // ── ABI encoding helpers ─────────────────────────────────────────────────
    const abiU256 = (n: number | bigint) => BigInt(n).toString(16).padStart(64, "0");
    const abiAddr = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
    const abiBool = (b: boolean) => (b ? "1" : "0").padStart(64, "0");
    const abiStr = (s: string): string => {
      const bytes = Array.from(new TextEncoder().encode(s));
      const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
      const padded = hex.padEnd(Math.ceil(bytes.length / 32) * 64, "0");
      return "0x" + abiU256(32) + abiU256(bytes.length) + padded;
    };

    const REGISTRY = REGISTRY_ADDRESS.toLowerCase();
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
      eth_chainId: HOODI_CHAIN_ID_HEX,
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
        if (sel === "0x483cdcf4") return "0x" + abiU256(options.emptyRegistry ? 0 : 2);
        // getTokenConfidentialTokenPairsSlice(uint256,uint256) → tuple[]
        if (sel === "0x90c60535") {
          if (options.emptyRegistry) return "0x" + abiU256(32) + abiU256(0);
          return (
            "0x" +
            abiU256(32) +
            abiU256(2) +
            abiAddr(T1) +
            abiAddr(CT1) +
            abiBool(true) + // pair[0]
            abiAddr(T2) +
            abiAddr(CT2) +
            abiBool(true) // pair[1]
          );
        }
      }

      const meta = TOKEN_META[to];
      if (meta) {
        if (sel === "0x06fdde03") return abiStr(meta.name); // name()
        if (sel === "0x95d89b41") return abiStr(meta.symbol); // symbol()
        if (sel === "0x313ce567") return "0x" + abiU256(meta.decimals); // decimals()
      }
      if (sel === "0x18160ddd") return "0x" + abiU256(0); // totalSupply()

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
      body: JSON.stringify(Array.isArray(body) ? body.map(respond) : respond(body)),
    });
  });
}

interface TestFixtures {
  /**
   * Override LedgerWebHIDProvider.connect() to bypass WebHID hardware access.
   * Call AFTER page.goto(). Then click the "Connect Ledger" button to trigger the
   * full page.tsx connect() flow with the mocked provider.
   */
  mockLedger: (config: LedgerConfig) => Promise<void>;
  /**
   * Simulate the Ledger device being unplugged mid-session.
   * Triggers _onDisconnect(), which resets state and emits disconnect + accountsChanged.
   */
  simulateDisconnect: () => Promise<void>;
  /** Intercept Hoodi RPC requests with static ABI-encoded responses. */
  mockRpc: (options?: RpcOptions) => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  mockLedger: async ({ page }, use) => {
    await use((config: LedgerConfig) => overrideLedgerConnect(page, config));
  },
  simulateDisconnect: async ({ page }, use) => {
    await use(() => triggerLedgerDisconnect(page));
  },
  mockRpc: async ({ page }, use) => {
    await use((options?: RpcOptions) => interceptRpc(page, options));
  },
});

export { expect };
