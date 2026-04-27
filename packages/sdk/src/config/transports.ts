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
 * Base relayer config. `buildZamaConfig` works with this type.
 *
 * Groups chains by transport reference identity, calls `createWorker`
 * once per group with all chain configs, then calls `createRelayer`
 * per chain with the shared worker.
 */
export interface RelayerConfig {
  readonly type: string;
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
export interface WebRelayerConfig extends RelayerConfig {
  readonly type: "web";
  readonly createWorker: (chains: FheChain[]) => RelayerWorkerClient;
  readonly createRelayer: (chain: FheChain, worker: RelayerWorkerClient) => RelayerWeb;
}

/** Cleartext transport — no worker, returns `RelayerCleartext`. */
export interface CleartextRelayerConfig extends RelayerConfig {
  readonly type: "cleartext";
  readonly createRelayer: (chain: FheChain, worker: unknown) => RelayerCleartext;
}

// ── Transport factories ──────────────────────────────────────────────────────

/**
 * Browser transport — routes to RelayerWeb (Web Worker + WASM).
 *
 * @param options - Worker options (threads, security, logger, storage).
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: web(),
 *   [mainnet.id]: web(),
 * }
 * ```
 */
export function web(options?: WebRelayerOptions): WebRelayerConfig {
  return {
    type: "web",
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
 * it is picked up automatically.
 *
 * @example
 * ```ts
 * // executorAddress comes from the chain preset:
 * relayers: { [hardhat.id]: cleartext() }
 * ```
 */
export function cleartext(): CleartextRelayerConfig {
  return {
    type: "cleartext",
    createRelayer: (resolvedChain) => {
      if (!resolvedChain.executorAddress) {
        throw new ConfigurationError(
          `Cleartext relayer requires an executorAddress. ` +
            `Either use a chain preset that includes it (e.g. hardhat, hoodi) ` +
            `or set it on the chain definition.`,
        );
      }
      return new RelayerCleartext(resolvedChain as FheChain);
    },
  };
}
