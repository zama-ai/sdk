import type { FheChain } from "../chains/types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { RelayerWebConfig } from "../relayer/relayer-sdk.types";
import { ConfigurationError } from "../errors";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import { CDN_INTEGRITY, CDN_URL, RelayerWeb } from "../relayer/relayer-web";
import { RelayerWorkerClient } from "../worker/worker.client";

// ── Shared option shapes ─────────────────────────────────────────────────────

/** Options for web() transport (threads, security, logger, storage). */
export type WebRelayerOptions = Partial<Omit<RelayerWebConfig, "chain" | "worker">>;

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
  /** Per-chain overrides (e.g. relayerUrl, registryAddress). */
  chain?: Partial<FheChain>;
  /** Create a shared worker/pool for all chains in this transport group. */
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
  readonly createWorker?: (chains: FheChain[]) => any;
  /** Create a single-chain relayer. `worker` is the return value of `createWorker`. */
  readonly createRelayer: (
    chain: FheChain,
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
    worker: any,
  ) => RelayerSDK;
}

/** Web transport — narrows worker type to `RelayerWorkerClient`. */
export interface WebTransportConfig extends TransportConfig {
  readonly type: "web";
  readonly createWorker: (chains: FheChain[]) => RelayerWorkerClient;
  readonly createRelayer: (chain: FheChain, worker: RelayerWorkerClient) => RelayerWeb;
}

/** Cleartext transport — no worker, returns `RelayerCleartext`. */
export interface CleartextTransportConfig extends TransportConfig {
  readonly type: "cleartext";
  readonly createRelayer: (chain: FheChain, worker: unknown) => RelayerCleartext;
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
  chain?: Partial<FheChain>,
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
 * When `executorAddress` is set on the chain definition (e.g. `hardhat`, `hoodi`),
 * it is picked up automatically — no need to pass it here.
 *
 * @example
 * ```ts
 * // executorAddress comes from the chain preset:
 * transports: { [hardhat.id]: cleartext() }
 *
 * // override for a custom chain:
 * transports: { [myChain.id]: cleartext({ executorAddress: "0x..." }) }
 * ```
 */
export function cleartext(chain?: Partial<FheChain>): CleartextTransportConfig {
  return {
    type: "cleartext",
    chain,
    createRelayer: (resolvedChain) => {
      const merged = { ...resolvedChain, ...chain };
      if (!merged.executorAddress) {
        throw new ConfigurationError(
          `Cleartext transport requires an executorAddress. ` +
            `Either use a chain preset that includes it (e.g. hardhat, hoodi) ` +
            `or pass it explicitly: cleartext({ executorAddress: "0x..." })`,
        );
      }
      return new RelayerCleartext(merged as FheChain);
    },
  };
}
