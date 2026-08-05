import { test as base, expect, type Page } from "@playwright/test";
import { decodeFunctionData, encodeAbiParameters, parseAbi, type Hex } from "viem";

export const AMOY_CHAIN_ID_HEX = "0x13882"; // 80002 in hex — Polygon Amoy chain ID
export const WRONG_CHAIN_ID = "0x1"; // Ethereum mainnet — used for wrong-network tests
export const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// On-chain WrappersRegistry address for Polygon Amoy (see registryAddress in src/providers.tsx).
export const REGISTRY_ADDRESS = "0xF486c3D4F4562760A43883e72E8D6f6Cf2EFdA94";

// Mock ERC-20 and confidential token addresses returned by the registry mock.
// All-digit addresses avoid EIP-55 checksum ambiguity (digits are case-neutral).
export const MOCK_TOKEN1_ADDRESS = "0x1111111111111111111111111111111111111111";
export const MOCK_CTOKEN1_ADDRESS = "0x2222222222222222222222222222222222222222";
export const MOCK_TOKEN2_ADDRESS = "0x3333333333333333333333333333333333333333";
export const MOCK_CTOKEN2_ADDRESS = "0x4444444444444444444444444444444444444444";

export interface WalletConfig {
  /**
   * Accounts returned by `eth_accounts`. Wagmi reconnects only from persisted
   * connector state, so tests use `requestAccounts` for explicit connection.
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
   * Contract reads use wagmi's HTTP transport rather than window.ethereum. The emptyRegistry
   * flag is therefore on RpcOptions (not WalletConfig) so the RPC interceptor can handle it.
   */
  emptyRegistry?: boolean;
}

/**
 * Injects a stateful mock EIP-1193 provider into the page before load.
 *
 * Key design decisions:
 * - `eth_accounts` and `eth_requestAccounts` are separate so tests can exercise
 *   wagmi's explicit connect flow.
 * - `window.__emitChainChanged(chainId)` is exposed so tests can simulate a
 *   user switching networks in their wallet; wagmi consumes `chainChanged`.
 * - `eth_sign`/`personal_sign`/`eth_signTypedData_v4` return a 65-byte hex string
 *   (32 bytes r + 32 bytes s + 1 byte v = ECDSA signature).
 * - `eth_call` is NOT handled here — wagmi routes contract reads to the Polygon Amoy RPC,
 *   bypassing window.ethereum. Registry reads and token metadata are therefore
 *   intercepted in `mockRpc`, not here.
 */
async function injectMockWallet(page: Page, config: WalletConfig) {
  await page.addInitScript((cfg: WalletConfig) => {
    let chainId = cfg.chainId;
    const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

    function emit(event: string, ...args: unknown[]) {
      for (const listener of listeners[event] ?? []) listener(...args);
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
          case "wallet_switchEthereumChain": {
            const newChainId = (params as [{ chainId: string }])[0].chainId;
            chainId = newChainId;
            setTimeout(() => emit("chainChanged", newChainId), 0);
            return Promise.resolve(null);
          }
          case "wallet_addEthereumChain":
            return Promise.resolve(null);
          case "eth_sendTransaction":
            return Promise.resolve("0x" + "1".repeat(64));
          case "net_version":
            return Promise.resolve("80002");
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
    // Fires the chainChanged event consumed by wagmi's injected connector.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__emitChainChanged = (id: string) => {
      chainId = id;
      emit("chainChanged", id);
    };
  }, config);
}

/**
 * Intercepts HTTP requests to the Polygon Amoy RPC endpoint and returns minimal
 * valid JSON-RPC responses.
 *
 * Wagmi's viem transport routes contract reads directly to the Polygon Amoy RPC. This
 * means registry reads (getTokenConfidentialTokenPairsLength /
 * getTokenConfidentialTokenPairsSlice) and token metadata (name/symbol/decimals)
 * must be handled here with ABI-encoded responses so useListPairs resolves in tests.
 *
 * All other eth_call requests (e.g. balanceOf) return "0x" (empty data), causing
 * the corresponding queries to fail gracefully and display "—" in the UI.
 */
async function interceptRpc(page: Page, options: RpcOptions = {}) {
  await page.route("**/polygon-amoy-bor-rpc.publicnode.com**", async (route) => {
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

    /** Polygon Amoy WrappersRegistry — lowercased for comparison with request `to` fields. */
    const REGISTRY = REGISTRY_ADDRESS.toLowerCase();
    const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";
    const MULTICALL3_ABI = parseAbi([
      "function aggregate3((address target,bool allowFailure,bytes callData)[] calls) view returns ((bool success, bytes returnData)[] returnData)",
    ]);

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
      eth_chainId: "0x13882",
      eth_blockNumber: "0x1",
      eth_getBalance: "0x0",
      eth_getTransactionCount: "0x0",
      eth_estimateGas: "0x5208",
      net_version: "80002",
    };

    function resolveDirectEthCall(req: { to?: string; data?: string }): Hex {
      const to = (req.to ?? "").toLowerCase();
      const sel = (req.data ?? "").slice(0, 10).toLowerCase();

      if (to === REGISTRY) {
        // getTokenConfidentialTokenPairsLength() → uint256
        if (sel === "0x483cdcf4") {
          return ("0x" + abiU256(options.emptyRegistry ? 0 : 2)) as Hex;
        }
        // getTokenConfidentialTokenPairsSlice(uint256,uint256) → tuple[]
        // Returns (address tokenAddress, address confidentialTokenAddress, bool isValid)[]
        if (sel === "0x90c60535") {
          if (options.emptyRegistry) {
            // ABI encoding of empty tuple[]: offset + length=0
            return ("0x" + abiU256(32) + abiU256(0)) as Hex;
          }
          return ("0x" +
            abiU256(32) + // offset to array data
            abiU256(2) + // array length
            abiAddr(T1) +
            abiAddr(CT1) +
            abiBool(true) + // pair[0]
            abiAddr(T2) +
            abiAddr(CT2) +
            abiBool(true)) as Hex; // pair[1]
        }
      }

      // Token metadata: name(), symbol(), decimals(), totalSupply()
      // Called by the SDK on both underlying and confidential token addresses.
      const meta = TOKEN_META[to];
      if (meta) {
        if (sel === "0x06fdde03") return abiStr(meta.name) as Hex; // name()
        if (sel === "0x95d89b41") return abiStr(meta.symbol) as Hex; // symbol()
        if (sel === "0x313ce567") return ("0x" + abiU256(meta.decimals)) as Hex; // decimals()
      }
      // totalSupply() — called only on the underlying ERC-20; returns uint256
      if (sel === "0x18160ddd") return ("0x" + abiU256(0)) as Hex;

      // All other eth_call requests (e.g. balanceOf) return empty data,
      // causing the caller to fail gracefully (query error → "—" in UI).
      return "0x";
    }

    function resolveEthCall(req: { to?: string; data?: string }): Hex {
      const to = (req.to ?? "").toLowerCase();
      const data = (req.data ?? "0x") as Hex;
      if (to !== MULTICALL3 || data.slice(0, 10).toLowerCase() !== "0x82ad56cb") {
        return resolveDirectEthCall(req);
      }

      try {
        const { args } = decodeFunctionData({ abi: MULTICALL3_ABI, data });
        const [calls] = args;
        return encodeAbiParameters(
          [
            {
              type: "tuple[]",
              components: [
                { name: "success", type: "bool" },
                { name: "returnData", type: "bytes" },
              ],
            },
          ],
          [
            calls.map((call) => ({
              success: true,
              returnData: resolveDirectEthCall({ to: call.target, data: call.callData }),
            })),
          ],
        );
      } catch {
        return "0x";
      }
    }

    function respond(req: { id?: number; method?: string; params?: unknown[] } | null) {
      if (!req) return { jsonrpc: "2.0", id: 1, result: null };
      if (req.method === "eth_call") {
        const [tx = {}] = (req.params ?? []) as Array<{ to?: string; data?: string }>;
        return { jsonrpc: "2.0", id: req.id ?? 1, result: resolveEthCall(tx) };
      }
      return { jsonrpc: "2.0", id: req.id ?? 1, result: staticResults[req.method ?? ""] ?? null };
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // Viem may send batch requests (array of JSON-RPC objects) — handle both forms.
      body: JSON.stringify(Array.isArray(body) ? body.map(respond) : respond(body)),
    });
  });
}

interface TestFixtures {
  /** Call with a WalletConfig to inject a mock EIP-1193 provider before page load. */
  mockWallet: (config: WalletConfig) => Promise<void>;
  /** Call to intercept Polygon Amoy RPC requests with static responses. */
  mockRpc: (options?: RpcOptions) => Promise<void>;
}

export const test = base.extend<TestFixtures>({
  // Auto-abort all relayer requests for every test. This app uses the web() transport,
  // so encrypt/decrypt would otherwise reach the real relayer through /api/relayer.
  // These tests exercise UI state only — no real FHE operations.
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
