import type { RelayerWebConfig } from "../relayer/relayer-sdk.types";
import type { RelayerNodeConfig } from "../relayer/relayer-node";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { CleartextConfig } from "../relayer/cleartext/types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { RelayerWeb } from "../relayer/relayer-web";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import { assertCondition } from "../utils";

// ── Shared option shapes ─────────────────────────────────────────────────────

/** Relayer-pool options shared across all chains using the same web relayer. */
export type WebRelayerOptions = Partial<Omit<RelayerWebConfig, "chain">>;

/** Relayer-pool options shared across all chains using the same node relayer. */
export type NodeRelayerOptions = Partial<Omit<RelayerNodeConfig, "chain">>;

/** Per-chain cleartext config. `executorAddress` is required. */
export type CleartextChainConfig = Partial<CleartextConfig> & {
  executorAddress: CleartextConfig["executorAddress"];
};

// ── Relayer factory type ────────────────────────────────────────────────────

/** Creates a RelayerSDK instance for a resolved chain + transport config. */
export type CreateRelayerFn = (
  chain: ExtendedFhevmInstanceConfig,
  transport: TransportConfig,
) => RelayerSDK;

// ── Transport types ──────────────────────────────────────────────────────────

/** Tagged transport: routes to RelayerWeb (browser). */
export interface WebTransportConfig {
  readonly type: "web";
  /** Per-chain FHE instance overrides (e.g. relayerUrl, network). */
  chain?: Partial<ExtendedFhevmInstanceConfig>;
  /** Shared relayer-pool options. Reference identity controls grouping: chains
   * that share the same `relayer` object reuse a single relayer instance. */
  relayer?: WebRelayerOptions;
  /** @internal */
  readonly createRelayer: CreateRelayerFn;
}

/** Tagged transport: routes to RelayerNode (Node.js). */
export interface NodeTransportConfig {
  readonly type: "node";
  /** Per-chain FHE instance overrides. */
  chain?: Partial<ExtendedFhevmInstanceConfig>;
  /** Shared relayer-pool options. Reference identity controls grouping. */
  relayer?: NodeRelayerOptions;
  /** @internal */
  readonly createRelayer: CreateRelayerFn;
}

/** Tagged transport: routes to RelayerCleartext (local dev / testnets). */
export interface CleartextTransportConfig {
  readonly type: "cleartext";
  chain: CleartextChainConfig;
  /** @internal */
  readonly createRelayer: CreateRelayerFn;
}

/** A per-chain transport entry. */
export type TransportConfig = WebTransportConfig | NodeTransportConfig | CleartextTransportConfig;

// ── Transport factories ──────────────────────────────────────────────────────

/**
 * Browser transport — routes to RelayerWeb (Web Worker + WASM).
 *
 * @param chain - Per-chain FHE instance overrides (e.g. `relayerUrl`, `network`).
 * @param relayer - Shared relayer-pool options (e.g. `threads`, `logger`). Chains
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
  return {
    type: "web",
    chain,
    relayer,
    createRelayer: (resolvedChain, transport) => {
      assertCondition(transport.type === "web", "Transport config must be of type `web`");
      return new RelayerWeb({
        chain: { ...resolvedChain, ...transport.chain },
        ...(transport as WebTransportConfig).relayer,
      });
    },
  };
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
  return {
    type: "cleartext",
    chain,
    createRelayer: (resolvedChain, transport) => {
      assertCondition(
        transport.type === "cleartext",
        "Transport config must be of type `cleartext`",
      );
      return new RelayerCleartext({
        ...resolvedChain,
        ...transport.chain,
      } as CleartextConfig);
    },
  };
}
