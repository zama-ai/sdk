import type { RelayerWebConfig } from "../relayer/relayer-sdk.types";
import type { RelayerNodeConfig } from "../relayer/relayer-node";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { CleartextConfig } from "../relayer/cleartext/types";

// ── Transport types ──────────────────────────────────────────────────────────

/** Fields a user can override per chain for the Web relayer. */
type WebRelayerOverrides = Partial<Omit<RelayerWebConfig, "transports" | "getChainId">>;

/** Fields a user can override per chain for the Node relayer. */
type NodeRelayerOverrides = Partial<Omit<RelayerNodeConfig, "transports" | "getChainId">>;

/** Tagged transport: routes to RelayerWeb (browser). */
export interface WebTransportConfig
  extends Partial<ExtendedFhevmInstanceConfig>, WebRelayerOverrides {
  readonly __mode: "web";
}

/** Tagged transport: routes to RelayerNode (Node.js). */
export interface NodeTransportConfig
  extends Partial<ExtendedFhevmInstanceConfig>, NodeRelayerOverrides {
  readonly __mode: "node";
}

/** Tagged transport: routes to RelayerCleartext (local dev / testnets). */
export interface CleartextTransportConfig extends Partial<CleartextConfig> {
  readonly __mode: "cleartext";
  executorAddress: CleartextConfig["executorAddress"];
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
  return { __mode: "web", ...config } as WebTransportConfig;
}

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * @example
 * ```ts
 * transports: { [sepolia.id]: node({ relayerUrl: "...", poolSize: 4 }) }
 * ```
 */
export function node(config?: Omit<NodeTransportConfig, "__mode">): NodeTransportConfig {
  return { __mode: "node", ...config } as NodeTransportConfig;
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
  config: Omit<CleartextTransportConfig, "__mode">,
): CleartextTransportConfig {
  return { __mode: "cleartext", ...config } as CleartextTransportConfig;
}
