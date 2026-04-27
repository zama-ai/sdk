import type { FheChain, AtLeastOneChain } from "../chains";
import type { ZamaSDKEventListener } from "../events";
import type { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { RelayerWebConfig } from "../relayer/relayer-sdk.types";
import type { RelayerWeb } from "../relayer/relayer-web";
import type { GenericProvider, GenericSigner, GenericStorage } from "../types";
import type { RelayerWorkerClient } from "../worker/worker.client";

export type { AtLeastOneChain };

// ── Shared option shapes ─────────────────────────────────────────────────────

/** Options for web() relayer (threads, security, logger, storage). */
export type WebRelayerOptions = Partial<Pick<RelayerWebConfig, "threads" | "security" | "logger">>;

// ── Relayer config types ─────────────────────────────────────────────────────

/**
 * Base relayer config.
 *
 * Groups chains by config reference identity, calls `createWorker`
 * once per group with all chain configs, then calls `createRelayer`
 * per chain with the shared worker.
 */
export interface RelayerConfig {
  readonly type: string;
  /** Create a shared worker/pool for all chains in this relayer group. */
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
  readonly createWorker?: (chains: FheChain[]) => any;
  /** Create a single-chain relayer. `worker` is the return value of `createWorker`. */
  readonly createRelayer: (
    chain: FheChain,
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
    worker: any,
  ) => RelayerSDK;
}

/** Web relayer config — narrows worker type to `RelayerWorkerClient`. */
export interface WebRelayerConfig extends RelayerConfig {
  readonly type: "web";
  readonly createWorker: (chains: FheChain[]) => RelayerWorkerClient;
  readonly createRelayer: (chain: FheChain, worker: RelayerWorkerClient) => RelayerWeb;
}

/** Cleartext relayer config — no worker, returns `RelayerCleartext`. */
export interface CleartextRelayerConfig extends RelayerConfig {
  readonly type: "cleartext";
  readonly createRelayer: (chain: FheChain, worker: unknown) => RelayerCleartext;
}

/** Shared options across all adapter paths. */
export interface ZamaConfigBase<TChains extends AtLeastOneChain = AtLeastOneChain> {
  /** FHE chain configurations. Defines which chains support FHE operations. */
  chains: TChains;
  /** Per-chain relayer configuration. Every chain must have a relayer entry. */
  relayers: { [K in TChains[number]["id"]]: RelayerConfig };
  /** Credential storage. Default: IndexedDB in browser, memory in Node. */
  storage?: GenericStorage;
  /** Session storage. Default: IndexedDB in browser, memory in Node. */
  sessionStorage?: GenericStorage;
  /** ML-KEM keypair TTL in seconds. Default: 2592000 (30 days). */
  keypairTTL?: number;
  /** Session signature TTL in seconds. Default: 2592000 (30 days). */
  sessionTTL?: number | "infinite";
  /** Registry cache TTL in seconds. Default: 86400 (24h). */
  registryTTL?: number;
  /** SDK lifecycle event listener. */
  onEvent?: ZamaSDKEventListener;
}

/** Resolved config object returned by `createConfig`. */
export interface ZamaConfig {
  readonly chains: readonly FheChain[];
  readonly relayer: RelayerDispatcher;
  readonly provider: GenericProvider;
  readonly signer: GenericSigner;
  readonly storage: GenericStorage;
  readonly sessionStorage: GenericStorage;
  readonly keypairTTL: number | undefined;
  readonly sessionTTL: number | "infinite" | undefined;
  readonly registryTTL: number | undefined;
  readonly onEvent: ZamaSDKEventListener | undefined;
}
