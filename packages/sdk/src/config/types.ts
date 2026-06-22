import type { FheChain, AtLeastOneChain } from "../chains";
import type { ZamaSDKEventListener } from "../events";
import type { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { RelayerWebConfig } from "../relayer/relayer-sdk.types";
import type { RelayerWeb } from "../relayer/relayer-web";
import type { GenericProvider, GenericSigner, GenericStorage } from "../types";
import type { GenericLogger } from "../worker/worker.types";
import type { LoggerService } from "../services/logger-service";
import type { RelayerWorkerClient } from "../worker/worker.client";

export type { AtLeastOneChain };

// ── Shared option shapes ─────────────────────────────────────────────────────

/**
 * Options for web() relayer (threads, security, storage).
 *
 * Logging is configured once, SDK-wide, via `createConfig({ logger })` — there
 * is deliberately no per-relayer logger option.
 */
export type WebRelayerOptions = Partial<
  Pick<RelayerWebConfig, "threads" | "security" | "fheArtifactStorage" | "fheArtifactCacheTTL">
>;

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
  /**
   * Create a shared worker/pool for all chains in this relayer group.
   * `logger` is the SDK-wide logger from `createConfig`, threaded through so
   * worker diagnostics route through the consumer's logger.
   */
  // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
  readonly createWorker?: (chains: FheChain[], logger: LoggerService) => any;
  /**
   * Create a single-chain relayer. `worker` is the return value of
   * `createWorker`; `logger` is the SDK-wide logger from `createConfig`.
   */
  readonly createRelayer: (
    chain: FheChain,
    // oxlint-disable-next-line typescript-eslint/no-explicit-any -- bivariant: subtypes narrow this
    worker: any,
    logger: LoggerService,
  ) => RelayerSDK;
}

/** Web relayer config — narrows worker type to `RelayerWorkerClient`. */
export interface WebRelayerConfig extends RelayerConfig {
  readonly type: "web";
  readonly createWorker: (chains: FheChain[], logger: LoggerService) => RelayerWorkerClient;
  readonly createRelayer: (
    chain: FheChain,
    worker: RelayerWorkerClient,
    logger: LoggerService,
  ) => RelayerWeb;
}

/** Cleartext relayer config — no worker, returns `RelayerCleartext`. */
export interface CleartextRelayerConfig extends RelayerConfig {
  readonly type: "cleartext";
  readonly createRelayer: (
    chain: FheChain,
    worker: unknown,
    logger: LoggerService,
  ) => RelayerCleartext;
}

/** Shared options across all adapter paths. */
export interface ZamaConfigBase<TChains extends AtLeastOneChain = AtLeastOneChain> {
  /** FHE chain configurations. Defines which chains support FHE operations. */
  chains: TChains;
  /** Per-chain relayer configuration. Every chain must have a relayer entry. */
  relayers: { [K in TChains[number]["id"]]: RelayerConfig };
  /** Credential storage. Default: IndexedDB in browser, memory in Node. */
  storage?: GenericStorage;
  /** Optional dedicated storage for permits. Defaults to `storage`. */
  permitStorage?: GenericStorage;
  /** ML-KEM transport key pair TTL in seconds. Default: 2592000 (30 days). */
  transportKeyPairTTL?: number;
  /** Permit lifetime in days. Default: 30. Clamped to `transportKeyPairTTL / 86400`. */
  permitTTL?: number;
  /** Registry cache TTL in seconds. Default: 86400 (24h). */
  registryTTL?: number;
  /** SDK lifecycle event listener. */
  onEvent?: ZamaSDKEventListener;
  /**
   * Optional logger for SDK diagnostics. Conforms to the four-level
   * {@link GenericLogger} interface (`error`/`warn`/`info`/`debug`), which
   * common loggers (console, pino, winston, OpenTelemetry's `DiagLogger`)
   * satisfy directly. When omitted, the SDK emits no log output of its own.
   * The SDK never bundles a logging library or imposes a format.
   */
  logger?: GenericLogger;
}

/** Generic config — pass any {@link GenericSigner} and {@link GenericProvider} directly. */
export interface ZamaConfigGeneric<
  TChains extends AtLeastOneChain = AtLeastOneChain,
> extends ZamaConfigBase<TChains> {
  /**
   * Optional wallet signer. Omit for read-only usage (indexers, SSR,
   * pre-wallet-connect states). Signer-required SDK operations throw
   * `SignerNotConfiguredError` when invoked without a signer.
   */
  signer?: GenericSigner;
  provider: GenericProvider;
}

declare const zamaConfigBrand: unique symbol;

/**
 * Resolved, validated config object. Obtain via `createConfig()` or an
 * adapter-specific factory — never construct by hand.
 */
export type ZamaConfig = {
  readonly chains: readonly FheChain[];
  readonly relayer: RelayerDispatcher;
  readonly provider: GenericProvider;
  readonly signer: GenericSigner | undefined;
  readonly storage: GenericStorage;
  readonly permitStorage: GenericStorage;
  readonly transportKeyPairTTL: number;
  readonly permitTTL: number;
  readonly registryTTL: number;
  readonly onEvent: ZamaSDKEventListener | undefined;
  /**
   * The SDK-wide logger, always present. Wraps the optional consumer-supplied
   * {@link GenericLogger}; silent when none was configured.
   */
  readonly logger: LoggerService;
} & { readonly [zamaConfigBrand]: true };
