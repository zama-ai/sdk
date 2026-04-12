import type { RelayerWebSecurityConfig } from "../relayer/relayer-sdk.types";
import type { GenericLogger } from "../worker/worker.types";
import type { GenericStorage } from "../types";
import type { CleartextConfig } from "../relayer/cleartext/types";

// ── Transport types ──────────────────────────────────────────────────────────

/** Tagged transport: routes to RelayerWeb (browser). */
export interface WebTransportConfig {
  readonly __mode: "web";
  relayerUrl?: string;
  /** RelayerWeb security config (CSRF, integrity check). */
  security?: RelayerWebSecurityConfig;
  /** WASM thread count for parallel FHE operations. */
  threads?: number;
}

/** Tagged transport: routes to RelayerNode (Node.js). */
export interface NodeTransportConfig {
  readonly __mode: "node";
  relayerUrl?: string;
  /** Worker thread pool size. Default: min(CPU cores, 4). */
  poolSize?: number;
  /** Logger for worker lifecycle and request timing. */
  logger?: GenericLogger;
  /** Persistent storage for caching FHE public key and params. */
  fheArtifactStorage?: GenericStorage;
  /** Cache TTL in seconds for FHE public material. Default: 86400 (24h). */
  fheArtifactCacheTTL?: number;
}

/** Tagged transport: routes to RelayerCleartext (local dev / testnets). */
export interface CleartextTransportConfig {
  readonly __mode: "cleartext";
  network?: CleartextConfig["network"];
  executorAddress: CleartextConfig["executorAddress"];
  kmsSignerPrivateKey?: CleartextConfig["kmsSignerPrivateKey"];
  inputSignerPrivateKey?: CleartextConfig["inputSignerPrivateKey"];
}

/** A per-chain transport entry. */
export type TransportConfig = WebTransportConfig | NodeTransportConfig | CleartextTransportConfig;

// ── Type guards ──────────────────────────────────────────────────────────────

export function isWebTransport(t: TransportConfig): t is WebTransportConfig {
  return t.__mode === "web";
}

export function isNodeTransport(t: TransportConfig): t is NodeTransportConfig {
  return t.__mode === "node";
}

export function isCleartextTransport(t: TransportConfig): t is CleartextTransportConfig {
  return t.__mode === "cleartext";
}

// ── Transport factories ──────────────────────────────────────────────────────

/**
 * Browser transport — routes to RelayerWeb (Web Worker + WASM).
 *
 * @example
 * ```ts
 * transports: { [sepolia.id]: web({ relayerUrl: "/api/relayer/11155111" }) }
 * ```
 */
export function web(config?: Omit<WebTransportConfig, "__mode">): WebTransportConfig {
  return { __mode: "web", ...config };
}

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * @example
 * ```ts
 * transports: { [sepolia.id]: node({ relayerUrl: "https://relayer.testnet.zama.org/v2", poolSize: 4 }) }
 * ```
 */
export function node(config?: Omit<NodeTransportConfig, "__mode">): NodeTransportConfig {
  return { __mode: "node", ...config };
}

/**
 * Cleartext transport — routes to RelayerCleartext (no FHE infrastructure).
 *
 * @example
 * ```ts
 * transports: { [hardhat.id]: cleartext({ executorAddress: "0x..." }) }
 * ```
 */
export function cleartext(
  config: Omit<CleartextTransportConfig, "__mode" | "network"> & {
    network?: CleartextConfig["network"];
  },
): CleartextTransportConfig {
  return { __mode: "cleartext", network: config.network ?? "", ...config };
}
