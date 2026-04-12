import type { RelayerWebSecurityConfig } from "../relayer/relayer-sdk.types";
import type { CleartextConfig } from "../relayer/cleartext/types";

/** Tagged transport: routes to RelayerWeb. */
export interface FhevmTransportConfig {
  readonly __mode: "fhevm";
  relayerUrl?: string;
  /** RelayerWeb security config (CSRF, integrity check). */
  security?: RelayerWebSecurityConfig;
  /** WASM thread count for parallel FHE operations. */
  threads?: number;
}

/** Tagged transport: routes to RelayerCleartext. */
export interface CleartextTransport {
  readonly __mode: "cleartext";
  network?: CleartextConfig["network"];
  executorAddress: CleartextConfig["executorAddress"];
  kmsSignerPrivateKey?: CleartextConfig["kmsSignerPrivateKey"];
  inputSignerPrivateKey?: CleartextConfig["inputSignerPrivateKey"];
}

/** A per-chain transport entry — fhevm or cleartext mode. */
export type TransportConfig = FhevmTransportConfig | CleartextTransport;

export function isCleartextTransport(t: TransportConfig): t is CleartextTransport {
  return t.__mode === "cleartext";
}

export function isFhevmTransport(t: TransportConfig): t is FhevmTransportConfig {
  return t.__mode === "fhevm";
}

/**
 * Create a per-chain transport for real FHE operations via RelayerWeb.
 *
 * @example
 * ```ts
 * // Use chain defaults
 * transports: { [sepolia.id]: fhevm() }
 *
 * // Override relayer URL
 * transports: { [sepolia.id]: fhevm({ relayerUrl: "/api/relayer/11155111" }) }
 * ```
 */
export function fhevm(config?: Omit<FhevmTransportConfig, "__mode">): FhevmTransportConfig {
  return { __mode: "fhevm", ...config };
}

/**
 * Create a per-chain transport for cleartext mode (no FHE infrastructure needed).
 *
 * @example
 * ```ts
 * transports: { [hardhat.id]: cleartext({ executorAddress: "0x..." }) }
 * ```
 */
export function cleartext(
  config: Omit<CleartextTransport, "__mode" | "network"> & { network?: CleartextConfig["network"] },
): CleartextTransport {
  return { __mode: "cleartext", network: config.network ?? "", ...config };
}
