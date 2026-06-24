import type { AtLeastOneChain, FheChain } from "../chains";
import type { ZamaSDKEventListener } from "../events";
import type { RelayerRouter } from "../relayer/relayer-router";
import type { RelayerSDK } from "../relayer/types";
import type { GenericLogger, GenericProvider, GenericSigner, GenericStorage } from "../types";

export type { AtLeastOneChain };

// ── Shared option shapes ─────────────────────────────────────────────────────

/** Options for the web() relayer. */
export interface WebRelayerOptions {
  /** Optional logger for observing FHE operation lifecycle and timing. */
  logger?: GenericLogger;
}

// ── Relayer config types ─────────────────────────────────────────────────────

/**
 * Base relayer config. `createRelayer` builds one single-chain relayer; the
 * dispatcher calls it once per chain.
 */
export interface RelayerConfig {
  readonly type: string;
  /** Create a single-chain relayer. */
  readonly createRelayer: (chain: FheChain) => RelayerSDK;
}

/** Web relayer config — drives the FHE backend directly. */
export interface WebRelayerConfig extends RelayerConfig {
  readonly type: "web";
}

/** Cleartext relayer config — drives the FHE backend in cleartext mode. */
export interface CleartextRelayerConfig extends RelayerConfig {
  readonly type: "cleartext";
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
  readonly router: RelayerRouter;
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
  readonly logger: GenericLogger;
} & { readonly [zamaConfigBrand]: true };
