import type { RelayerWebConfig } from "../relayer/relayer-sdk.types";
import type { RelayerNodeConfig } from "../relayer/relayer-node";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { CleartextConfig } from "../relayer/cleartext/types";

// ── Shared option shapes ─────────────────────────────────────────────────────

/** Relayer-pool options shared across all chains using the same web relayer. */
export type WebRelayerOptions = Partial<Omit<RelayerWebConfig, "transports" | "getChainId">>;

/** Relayer-pool options shared across all chains using the same node relayer. */
export type NodeRelayerOptions = Partial<Omit<RelayerNodeConfig, "transports" | "getChainId">>;

/** Per-chain cleartext config. `executorAddress` is required. */
export type CleartextChainConfig = Partial<CleartextConfig> & {
  executorAddress: CleartextConfig["executorAddress"];
};

// ── Transport types ──────────────────────────────────────────────────────────

/** Tagged transport: routes to RelayerWeb (browser). */
export interface WebTransportConfig {
  readonly type: "web";
  /** Per-chain FHE instance overrides (e.g. relayerUrl, network). */
  chain?: Partial<ExtendedFhevmInstanceConfig>;
  /** Shared relayer-pool options. Reference identity controls grouping: chains
   * that share the same `relayer` object reuse a single relayer instance. */
  relayer?: WebRelayerOptions;
}

/** Tagged transport: routes to RelayerNode (Node.js). */
export interface NodeTransportConfig {
  readonly type: "node";
  /** Per-chain FHE instance overrides. */
  chain?: Partial<ExtendedFhevmInstanceConfig>;
  /** Shared relayer-pool options. Reference identity controls grouping. */
  relayer?: NodeRelayerOptions;
}

/** Tagged transport: routes to RelayerCleartext (local dev / testnets). */
export interface CleartextTransportConfig {
  readonly type: "cleartext";
  chain: CleartextChainConfig;
}

/** Tagged transport: user-provided RelayerSDK for a specific chain. */
export interface CustomTransportConfig {
  readonly type: "custom";
  relayer: RelayerSDK;
}

/** A per-chain transport entry. */
export type TransportConfig =
  | WebTransportConfig
  | NodeTransportConfig
  | CleartextTransportConfig
  | CustomTransportConfig;

// ── Transport factories ──────────────────────────────────────────────────────

/**
 * Browser transport — routes to RelayerWeb (Web Worker + WASM).
 *
 * @param chain Per-chain FHE instance overrides (e.g. `relayerUrl`, `network`).
 * @param relayer Shared relayer-pool options (e.g. `threads`, `logger`). Chains
 *   that pass the *same* `relayer` object reuse a single relayer instance.
 *
 * @example
 * ```ts
 * transports: {
 *   [sepolia.id]: web({ relayerUrl: "/api/relayer/11155111" }),
 *   [mainnet.id]: web({ relayerUrl: "/api/relayer/1" }, sharedOpts),
 * }
 * ```
 */
export function web(
  chain?: Partial<ExtendedFhevmInstanceConfig>,
  relayer?: WebRelayerOptions,
): WebTransportConfig {
  return { type: "web", chain, relayer };
}

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * @param chain Per-chain FHE instance overrides.
 * @param relayer Shared relayer-pool options (e.g. `poolSize`, `logger`).
 *
 * @example
 * ```ts
 * transports: { [sepolia.id]: node({ relayerUrl: "..." }, { poolSize: 4 }) }
 * ```
 */
export function node(
  chain?: Partial<ExtendedFhevmInstanceConfig>,
  relayer?: NodeRelayerOptions,
): NodeTransportConfig {
  return { type: "node", chain, relayer };
}

/**
 * Cleartext transport — routes to RelayerCleartext (no FHE infrastructure).
 *
 * @example
 * ```ts
 * transports: { [hardhat.id]: cleartext({ executorAddress: "0x..." }) }
 * ```
 */
export function cleartext(chain: CleartextChainConfig): CleartextTransportConfig {
  return { type: "cleartext", chain };
}

/**
 * Custom transport — inject a user-provided RelayerSDK for a specific chain.
 *
 * @example
 * ```ts
 * transports: { [mainnet.id]: custom(myRelayer) }
 * ```
 */
export function custom(relayer: RelayerSDK): CustomTransportConfig {
  return { type: "custom", relayer };
}
