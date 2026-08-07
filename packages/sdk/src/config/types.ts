import type { AtLeastOneChain, FheChain } from "../chains";
import type { ZamaSDKEventListener } from "../events";
import type { ChainRouter } from "../chains/router";
import type { FhevmRuntimeConfig, RelayerSDK } from "../relayer/types";
import type { GenericLogger, GenericProvider, GenericSigner, GenericStorage } from "../types";

export type { AtLeastOneChain };

// ── Relayer config types ─────────────────────────────────────────────────────

/**
 * Base relayer config. `createRelayer` builds one single-chain relayer; the
 * dispatcher calls it once per chain.
 */
export interface RelayerConfig {
  /** Discriminant identifying the relayer transport (e.g. `"web"`, `"node"`, `"cleartext"`). */
  readonly type: string;
  /**
   * Create a single-chain relayer.
   * @internal
   */
  readonly createRelayer: (chain: FheChain) => RelayerSDK;
}

/** Web relayer config — drives the FHE backend directly. */
export interface WebRelayerConfig extends RelayerConfig {
  /** Discriminant for the web transport. */
  readonly type: "web";
}

/** Cleartext relayer config — drives the FHE backend in cleartext mode. */
export interface CleartextRelayerConfig extends RelayerConfig {
  /** Discriminant for the cleartext transport. */
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
  /**
   * Opt-in shared-tenant scope (B2B2C/WaaS operators) — an opaque identifier such
   * as a tenant ID. Every signer configured with the same scope shares one
   * transport key pair instead of one per signer address. Permits stay per-signer
   * regardless. Omit for the default: one key pair per signer. See
   * `sdk.permits.revokeTransportKeyPair()` for the operator-level counterpart to
   * signer-level revocation.
   */
  transportKeyPairScope?: string;
  /**
   * Opt-in at-rest wrapping of the transport key pair's private half — for headless
   * contexts with no secure storage backend to delegate to (CLI tools, bare-metal
   * agents, local dev). Wraps with HKDF-SHA256(this secret, identity) → AES-256-GCM
   * before every write, unwraps after every read; the SDK never manages or stores
   * this value itself. Must be at least 256 bits of real entropy (a CSPRNG or secrets
   * manager, not a passphrase — this scheme does no key-stretching). Omit for the
   * default: plaintext, security delegated to the storage backend. Composes with
   * `transportKeyPairScope`: when both are set, the derivation binds to the scope, so
   * every signer in the scope produces the same wrapping key — but every instance
   * sharing that scope must then use the *same* secret. Any mismatch (wrong secret,
   * or the secret set on some instances and not others) throws instead of silently
   * regenerating, which would clobber the scope's shared entry; migrate a live scope
   * by configuring the secret everywhere, then calling
   * `sdk.permits.revokeTransportKeyPair(scopeId)` once. Without a scope, changing
   * this value is self-healing: the next
   * `grantPermit()` regenerates the per-signer key pair transparently, not a crash.
   */
  derivationSecret?: string | Uint8Array;
  /** Registry cache TTL in seconds. Default: 86400 (24h). */
  registryTTL?: number;
  /** SDK lifecycle event listener. */
  onEvent?: ZamaSDKEventListener;
  /**
   * Global `@fhevm/sdk` runtime config — WASM load mode, threads, logger, auth,
   * module versions. `runtime.auth` is the process-wide fallback; each chain's
   * `auth` is forwarded on that chain's relayer requests and takes precedence.
   */
  runtime?: FhevmRuntimeConfig;
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
  /** Provider for public host-chain reads. */
  provider: GenericProvider;
}

declare const zamaConfigBrand: unique symbol;

/**
 * Resolved, validated config object. Obtain via `createConfig()` or an
 * adapter-specific factory — never construct by hand.
 */
export type ZamaConfig = {
  readonly chains: readonly FheChain[];
  /** @internal */
  readonly router: ChainRouter;
  readonly provider: GenericProvider;
  readonly signer: GenericSigner | undefined;
  readonly storage: GenericStorage;
  readonly permitStorage: GenericStorage;
  readonly transportKeyPairTTL: number;
  readonly permitTTL: number;
  readonly transportKeyPairScope: string | undefined;
  readonly derivationSecret: string | Uint8Array | undefined;
  readonly registryTTL: number;
  readonly onEvent: ZamaSDKEventListener | undefined;
  /**
   * The SDK-wide logger, always present. Wraps the optional consumer-supplied
   * {@link GenericLogger}; silent when none was configured.
   */
  readonly logger: GenericLogger;
} & { readonly [zamaConfigBrand]: true };
