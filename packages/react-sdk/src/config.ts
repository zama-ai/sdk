import type { Address, PublicClient, WalletClient, EIP1193Provider } from "viem";
import type { Config } from "wagmi";
import { getChainId } from "wagmi/actions";
import type { Signer, Provider } from "ethers";
import type {
  GenericSigner,
  GenericStorage,
  RelayerWebSecurityConfig,
  ZamaSDKEventListener,
  ExtendedFhevmInstanceConfig,
} from "@zama-fhe/sdk";
import { RelayerWeb, MemoryStorage, IndexedDBStorage, DefaultConfigs } from "@zama-fhe/sdk";
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
  wagmiConfig?: never;
  signer?: never;
  ethers?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  wagmiConfig?: never;
  signer?: never;
  viem?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Escape hatch — raw GenericSigner for custom implementations. */
export interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  wagmiConfig?: never;
  viem?: never;
  ethers?: never;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}

/** Union of all config variants passed to {@link createZamaConfig}. */
export type CreateZamaConfigParams =
  | ZamaConfigWagmi
  | ZamaConfigViem
  | ZamaConfigEthers
  | ZamaConfigCustomSigner;

/** Opaque config object returned by {@link createZamaConfig}. Pass to `<ZamaProvider config={...}>`. */
export interface ZamaConfig {
  /** @internal */ readonly _relayer: RelayerWeb;
  /** @internal */ readonly _signer: GenericSigner;
  /** @internal */ readonly _storage: GenericStorage;
  /** @internal */ readonly _sessionStorage: GenericStorage;
  /** @internal */ readonly _keypairTTL: number | undefined;
  /** @internal */ readonly _sessionTTL: number | "infinite" | undefined;
  /** @internal */ readonly _registryAddresses: Record<number, Address> | undefined;
  /** @internal */ readonly _registryTTL: number | undefined;
  /** @internal */ readonly _onEvent: ZamaSDKEventListener | undefined;
}

const isBrowser = typeof window !== "undefined";

function resolveSigner(params: CreateZamaConfigParams): GenericSigner {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    return new WagmiSigner({ config: params.wagmiConfig });
  }
  if ("viem" in params && params.viem) {
    return new ViemSigner({
      publicClient: params.viem.publicClient,
      walletClient: params.viem.walletClient,
      ethereum: params.viem.ethereum,
    });
  }
  if ("ethers" in params && params.ethers) {
    return new EthersSigner(params.ethers);
  }
  return params.signer;
}

function resolveTransports(
  params: CreateZamaConfigParams,
): Record<number, Partial<ExtendedFhevmInstanceConfig>> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const resolved: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
    for (const chain of params.wagmiConfig.chains) {
      const defaultConfig = DefaultConfigs[chain.id];
      const userOverride = params.transports?.[chain.id];
      if (defaultConfig || userOverride) {
        resolved[chain.id] = { ...defaultConfig, ...userOverride };
      } else {
        // oxlint-disable-next-line no-console
        console.warn(
          `[zama-sdk] Chain ${chain.id} (${chain.name}) has no default FHE config and no transport override was provided. FHE operations on this chain will fail.`,
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
  const resolvedStorage =
    storage ?? (isBrowser ? new IndexedDBStorage("CredentialStore") : new MemoryStorage());
  const resolvedSessionStorage =
    sessionStorage ?? (isBrowser ? new IndexedDBStorage("SessionStore") : new MemoryStorage());

  if (resolvedStorage === resolvedSessionStorage) {
    // oxlint-disable-next-line no-console
    console.warn(
      "[zama-sdk] storage and sessionStorage point to the same instance. " +
        "This will cause session entries to overwrite encrypted keypairs. " +
        "Use two separate storage instances.",
    );
  }

  return { storage: resolvedStorage, sessionStorage: resolvedSessionStorage };
}

function resolveGetChainId(
  params: CreateZamaConfigParams,
  signer: GenericSigner,
): () => Promise<number> {
  if ("wagmiConfig" in params && params.wagmiConfig) {
    const config = params.wagmiConfig;
    return () => Promise.resolve(getChainId(config));
  }
  return () => signer.getChainId();
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
  const signer = resolveSigner(params);
  const transports = resolveTransports(params);
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const getChainIdFn = resolveGetChainId(params, signer);

  const relayer = new RelayerWeb({
    getChainId: getChainIdFn,
    transports,
    security: params.security,
    threads: params.threads,
  });

  return {
    _relayer: relayer,
    _signer: signer,
    _storage: storage,
    _sessionStorage: sessionStorage,
    _keypairTTL: params.keypairTTL,
    _sessionTTL: params.sessionTTL,
    _registryAddresses: params.registryAddresses,
    _registryTTL: params.registryTTL,
    _onEvent: params.onEvent,
  };
}
