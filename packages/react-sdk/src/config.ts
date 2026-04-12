import type { Address, PublicClient, WalletClient, EIP1193Provider } from "viem";
import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import type { Signer, Provider } from "ethers";
import type {
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  RelayerWebSecurityConfig,
  ZamaSDKEventListener,
  ExtendedFhevmInstanceConfig,
} from "@zama-fhe/sdk";
import {
  RelayerWeb,
  MemoryStorage,
  IndexedDBStorage,
  DefaultConfigs,
  ConfigurationError,
} from "@zama-fhe/sdk";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { WagmiSigner } from "./wagmi/wagmi-signer";

/** Shared options across all adapter paths. */
interface ZamaConfigBase {
  /** Per-chain relayer transport overrides. Merged on top of auto-resolved defaults. */
  transports?: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
  /** Credential storage. Default: IndexedDBStorage("CredentialStore") in browser, MemoryStorage in Node. */
  storage?: GenericStorage;
  /** Session storage. Default: IndexedDBStorage("SessionStore") in browser, MemoryStorage in Node. */
  sessionStorage?: GenericStorage;
  /** ML-KEM keypair TTL in seconds. Default: 2592000 (30 days). */
  keypairTTL?: number;
  /** Session signature TTL in seconds. Default: 2592000 (30 days). */
  sessionTTL?: number | "infinite";
  /** Per-chain registry address overrides. */
  registryAddresses?: Record<number, Address>;
  /** Registry cache TTL in seconds. Default: 86400 (24h). */
  registryTTL?: number;
  /** SDK lifecycle event listener. */
  onEvent?: ZamaSDKEventListener;
  /** RelayerWeb security config (CSRF, integrity check). */
  security?: RelayerWebSecurityConfig;
  /** WASM thread count for parallel FHE operations. */
  threads?: number;
}

/** Wagmi-backed config — signer derived from wagmi Config. */
export interface ZamaConfigWagmi extends ZamaConfigBase {
  wagmiConfig: Config;
  relayer?: never;
  signer?: never;
  viem?: never;
  ethers?: never;
}

/** Viem path — takes native viem clients. */
export interface ZamaConfigViem extends ZamaConfigBase {
  viem: {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    ethereum?: EIP1193Provider;
  };
  relayer?: never;
  wagmiConfig?: never;
  signer?: never;
  ethers?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  relayer?: never;
  wagmiConfig?: never;
  signer?: never;
  viem?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Escape hatch — raw GenericSigner for custom implementations. */
export interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  relayer?: never;
  wagmiConfig?: never;
  viem?: never;
  ethers?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Pre-built relayer — bring your own RelayerSDK (e.g. RelayerCleartext for local dev). */
export interface ZamaConfigCustomRelayer extends Omit<
  ZamaConfigBase,
  "security" | "threads" | "transports"
> {
  relayer: RelayerSDK;
  signer: GenericSigner;
  wagmiConfig?: never;
  viem?: never;
  ethers?: never;
}

/** Union of all config variants passed to {@link createZamaConfig}. */
export type CreateZamaConfigParams =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner
  | ZamaConfigCustomRelayer;

/** Opaque config object returned by {@link createZamaConfig}. Pass to `<ZamaProvider config={...}>`. */
export interface ZamaConfig {
  /** @internal */ readonly relayer: RelayerSDK;
  /** @internal */ readonly signer: GenericSigner;
  /** @internal */ readonly storage: GenericStorage;
  /** @internal */ readonly sessionStorage: GenericStorage;
  /** @internal */ readonly keypairTTL: number | undefined;
  /** @internal */ readonly sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly registryAddresses: Record<number, Address> | undefined;
  /** @internal */ readonly registryTTL: number | undefined;
  /** @internal */ readonly onEvent: ZamaSDKEventListener | undefined;
}

const isBrowser = typeof window !== "undefined";

const defaultStorage = isBrowser ? new IndexedDBStorage("CredentialStore") : new MemoryStorage();
const defaultSessionStorage = isBrowser
  ? new IndexedDBStorage("SessionStore")
  : new MemoryStorage();

function resolveSigner(params: CreateZamaConfigWithTransports): GenericSigner {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    return new WagmiSigner({ config: params.wagmiConfig });
  }
  if ("viem" in params && params.viem) {
    return new ViemSigner(params.viem);
  }
  if ("ethers" in params && params.ethers) {
    return new EthersSigner(params.ethers);
  }
  return params.signer;
}

type CreateZamaConfigWithTransports =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner;

function resolveTransports(
  params: CreateZamaConfigWithTransports,
): Record<number, Partial<ExtendedFhevmInstanceConfig>> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const resolved: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
    for (const chain of params.wagmiConfig.chains) {
      const defaultConfig = DefaultConfigs[chain.id];
      const userOverride = params.transports?.[chain.id];
      if (defaultConfig || userOverride) {
        resolved[chain.id] = { ...defaultConfig, ...userOverride };
      } else {
        throw new ConfigurationError(
          `Chain ${chain.id} (${chain.name}) has no default FHE config and no transport override was provided. ` +
            `Either remove this chain from your wagmi config or provide a transport override via the transports option.`,
        );
      }
    }
    return resolved;
  }
  return params.transports;
}

function resolveStorage(
  storage: GenericStorage | undefined,
  sessionStorage: GenericStorage | undefined,
): { storage: GenericStorage; sessionStorage: GenericStorage } {
  return {
    storage: storage ?? defaultStorage,
    sessionStorage: sessionStorage ?? defaultSessionStorage,
  };
}

function resolveGetChainId(
  params: CreateZamaConfigWithTransports,
  signer: GenericSigner,
): () => Promise<number> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const config = params.wagmiConfig;
    return () => Promise.resolve(getChainId(config));
  }
  return () => signer.getChainId();
}

/**
 * Create a per-chain transport override with the given relayer proxy URL.
 *
 * @example
 * ```ts
 * createZamaConfig({
 *   wagmiConfig,
 *   transports: {
 *     [sepolia.id]: relayer("/api/relayer/11155111"),
 *   },
 * });
 * ```
 */
export function relayer(
  relayerUrl: string,
  overrides?: Partial<ExtendedFhevmInstanceConfig>,
): Partial<ExtendedFhevmInstanceConfig> {
  return { relayerUrl, ...overrides };
}

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * Supports four adapter paths:
 * - **wagmiConfig** — derives signer from wagmi, auto-resolves transports from chains
 * - **viem** — takes native viem `PublicClient`/`WalletClient`
 * - **ethers** — takes native ethers `Signer`/`Provider`/`EIP1193Provider`
 * - **signer** — escape hatch for custom `GenericSigner` implementations
 *
 * @example
 * ```ts
 * const zamaConfig = createZamaConfig({ wagmiConfig });
 * // or
 * const zamaConfig = createZamaConfig({
 *   viem: { publicClient, walletClient },
 *   transports: { [sepolia.id]: SepoliaConfig },
 * });
 * ```
 */
export function createZamaConfig(params: CreateZamaConfigParams): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);

  if ("relayer" in params && params.relayer) {
    return {
      relayer: params.relayer,
      signer: params.signer,
      storage,
      sessionStorage,
      keypairTTL: params.keypairTTL,
      sessionTTL: params.sessionTTL,
      registryAddresses: params.registryAddresses,
      registryTTL: params.registryTTL,
      onEvent: params.onEvent,
    };
  }

  const signer = resolveSigner(params);

  return {
    relayer: new RelayerWeb({
      getChainId: resolveGetChainId(params, signer),
      transports: resolveTransports(params),
      security: params.security,
      threads: params.threads,
    }),
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryAddresses: params.registryAddresses,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  };
}
