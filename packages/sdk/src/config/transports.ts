import type { RelayerWebConfig } from "../relayer/relayer-sdk.types";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { CleartextConfig } from "../relayer/cleartext/types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import { CDN_INTEGRITY, CDN_URL, RelayerWeb } from "../relayer/relayer-web";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import { RelayerWorkerClient } from "../worker/worker.client";

// ── Shared option shapes ─────────────────────────────────────────────────────

/** Options for web() transport (threads, security, logger, storage). */
export type WebRelayerOptions = Partial<Omit<RelayerWebConfig, "chain" | "worker">>;

/** Per-chain cleartext config. `executorAddress` is required. */
export type CleartextChainConfig = Partial<CleartextConfig> & {
  executorAddress: CleartextConfig["executorAddress"];
};

// ── Transport interface ─────────────────────────────────────────────────────

/**
 * Base transport config. `buildZamaConfig` works with this type.
 *
 * Groups chains by transport reference identity, calls `createWorker`
 * once per group with all chain configs, then calls `createRelayer`
 * per chain with the shared worker.
 */
export interface TransportConfig {
  readonly type: string;
  /** Per-chain FHE instance overrides (e.g. relayerUrl). */
  chain?: Partial<ExtendedFhevmInstanceConfig>;
  /** Create a shared worker/pool for all chains in this transport group. */
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
  readonly createWorker?: (chains: ExtendedFhevmInstanceConfig[]) => any;
  /** Create a single-chain relayer. `worker` is the return value of `createWorker`. */
  readonly createRelayer: (
    chain: ExtendedFhevmInstanceConfig,
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
    worker: any,
  ) => RelayerSDK;
}

/** Web transport — narrows worker type to `RelayerWorkerClient`. */
export interface WebTransportConfig extends TransportConfig {
  readonly type: "web";
  readonly createWorker: (chains: ExtendedFhevmInstanceConfig[]) => RelayerWorkerClient;
  readonly createRelayer: (
    chain: ExtendedFhevmInstanceConfig,
    worker: RelayerWorkerClient,
  ) => RelayerWeb;
}

/** Cleartext transport — no worker, returns `RelayerCleartext`. */
export interface CleartextTransportConfig extends TransportConfig {
  readonly type: "cleartext";
  readonly createRelayer: (chain: ExtendedFhevmInstanceConfig, worker: unknown) => RelayerCleartext;
}

// ── Transport factories ──────────────────────────────────────────────────────

/**
 * Browser transport — routes to RelayerWeb (Web Worker + WASM).
 *
 * @param chain - Per-chain FHE instance overrides (e.g. `relayerUrl`).
 * @param options - Worker options (threads, security, logger, storage).
 *
 * @example
 * ```ts
 * transports: {
 *   [sepolia.id]: web({ relayerUrl: "/api/relayer/11155111" }),
 *   [mainnet.id]: web({ relayerUrl: "/api/relayer/1" }),
 * }
 * ```
 */
export function web(
  chain?: Partial<ExtendedFhevmInstanceConfig>,
  options?: WebRelayerOptions,
): WebTransportConfig {
  return {
    type: "web",
    chain,
    createWorker: (chains) =>
      new RelayerWorkerClient({
        cdnUrl: CDN_URL,
        chains,
        csrfToken: options?.security?.getCsrfToken?.() ?? "",
        integrity: options?.security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
        logger: options?.logger,
        thread: options?.threads,
      }),
    createRelayer: (resolvedChain, worker) =>
      new RelayerWeb({ chain: resolvedChain, worker, ...options }),
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
    createRelayer: (resolvedChain) =>
      new RelayerCleartext({ ...resolvedChain, ...chain } as CleartextConfig),
  };
}
