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
  CompositeRelayer,
  MemoryStorage,
  IndexedDBStorage,
  ConfigurationError,
} from "@zama-fhe/sdk";
import { RelayerCleartext } from "@zama-fhe/sdk/cleartext";
import type { CleartextConfig } from "@zama-fhe/sdk/cleartext";
import { ViemSigner } from "@zama-fhe/sdk/viem";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { WagmiSigner } from "./wagmi/wagmi-signer";

/** Shared options across all adapter paths. */
interface ZamaConfigBase {
  /** FHE chain configurations. Defines which chains support FHE operations and their contract addresses. */
  chains: ExtendedFhevmInstanceConfig[];
  /** Per-chain relayer transport overrides. Merged on top of chain defaults. */
  transports?: Record<number, TransportConfig>;
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
  transports: Record<number, TransportConfig>;
}

/** Ethers path — takes native ethers types. */
export interface ZamaConfigEthers extends ZamaConfigBase {
  ethers: { ethereum: EIP1193Provider } | { signer: Signer } | { provider: Provider };
  relayer?: never;
  wagmiConfig?: never;
  signer?: never;
  viem?: never;
  transports: Record<number, TransportConfig>;
}

/** Escape hatch — raw GenericSigner for custom implementations. */
export interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  relayer?: never;
  wagmiConfig?: never;
  viem?: never;
  ethers?: never;
  transports: Record<number, TransportConfig>;
}

/** Pre-built relayer — bring your own RelayerSDK (e.g. RelayerCleartext for local dev). */
export interface ZamaConfigCustomRelayer extends Omit<ZamaConfigBase, "transports" | "chains"> {
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

/**
 * Resolve per-chain transport entries by merging chain defaults with user overrides.
 * Returns a map of chainId → merged TransportConfig.
 */
function resolveChainTransports(
  params: CreateZamaConfigWithTransports,
): Map<number, { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }> {
  const chainMap = new Map(params.chains.map((c) => [c.chainId, c]));
  const result = new Map<
    number,
    { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }
  >();

  const chainIds =
    "wagmiConfig" in params && params.wagmiConfig
      ? params.wagmiConfig.chains.map((c: { id: number; name: string }) => c.id)
      : params.chains.map((c) => c.chainId);

  for (const id of chainIds) {
    const chainConfig = chainMap.get(id);
    const userTransport = params.transports?.[id];

    if (!chainConfig && !userTransport) {
      const name =
        "wagmiConfig" in params
          ? (params.wagmiConfig?.chains.find((c: { id: number }) => c.id === id)?.name ?? id)
          : id;
      throw new ConfigurationError(
        `Chain ${id} (${name}) has no FHE chain config in the chains array and no transport override was provided. ` +
          `Either add this chain to the chains array or provide a transport override.`,
      );
    }

    if (userTransport && isCleartextTransport(userTransport)) {
      if (!chainConfig) {
        throw new ConfigurationError(
          `Chain ${id} uses cleartext transport but has no entry in the chains array. ` +
            `Add the chain config to the chains array.`,
        );
      }
      result.set(id, { chain: chainConfig, transport: userTransport });
    } else if (chainConfig) {
      result.set(id, {
        chain: chainConfig,
        transport: userTransport ? { ...chainConfig, ...userTransport } : { ...chainConfig },
      });
    }
  }

  return result;
}

/**
 * Build the appropriate RelayerSDK from resolved chain transports.
 * If all chains are web → single RelayerWeb.
 * If any chain is cleartext → dispatch relayer that routes by chain ID.
 */
function buildRelayer(
  chainTransports: Map<number, { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  const webTransports: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
  const cleartextRelayers = new Map<number, RelayerCleartext>();
  let security: RelayerWebSecurityConfig | undefined;
  let threads: number | undefined;

  for (const [chainId, { chain, transport }] of chainTransports) {
    if (isCleartextTransport(transport)) {
      cleartextRelayers.set(
        chainId,
        new RelayerCleartext({
          chainId: chain.chainId,
          gatewayChainId: chain.gatewayChainId,
          aclContractAddress: chain.aclContractAddress as Address,
          verifyingContractAddressDecryption: chain.verifyingContractAddressDecryption as Address,
          verifyingContractAddressInputVerification:
            chain.verifyingContractAddressInputVerification as Address,
          registryAddress: chain.registryAddress,
          network: transport.network,
          executorAddress: transport.executorAddress,
          kmsSignerPrivateKey: transport.kmsSignerPrivateKey,
          inputSignerPrivateKey: transport.inputSignerPrivateKey,
        }),
      );
    } else {
      const { security: s, threads: t, ...fhevmConfig } = transport as FhevmTransport;
      if (s) {
        security = s;
      }
      if (t) {
        threads = t;
      }
      webTransports[chainId] = fhevmConfig;
    }
  }

  // All web — simple case
  if (cleartextRelayers.size === 0) {
    return new RelayerWeb({
      getChainId: resolveChainId,
      transports: webTransports,
      security,
      threads,
    });
  }

  // All cleartext — no RelayerWeb needed
  if (Object.keys(webTransports).length === 0) {
    return new CompositeRelayer(resolveChainId, cleartextRelayers as Map<number, RelayerSDK>);
  }

  // Mixed — dispatch by chain
  const webRelayer = new RelayerWeb({
    getChainId: resolveChainId,
    transports: webTransports,
    security,
    threads,
  });
  const allRelayers = new Map<number, RelayerSDK>(cleartextRelayers);
  for (const id of Object.keys(webTransports)) {
    allRelayers.set(Number(id), webRelayer);
  }
  return new CompositeRelayer(resolveChainId, allRelayers);
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

/** Tagged transport: routes to RelayerCleartext. */
export interface CleartextTransport {
  readonly __mode: "cleartext";
  network: CleartextConfig["network"];
  executorAddress: CleartextConfig["executorAddress"];
  kmsSignerPrivateKey?: CleartextConfig["kmsSignerPrivateKey"];
  inputSignerPrivateKey?: CleartextConfig["inputSignerPrivateKey"];
}

/** A per-chain transport entry — either a relayer override (default) or cleartext mode. */
export type TransportConfig = Partial<ExtendedFhevmInstanceConfig> | CleartextTransport;

function isCleartextTransport(t: TransportConfig): t is CleartextTransport {
  return "__mode" in t && t.__mode === "cleartext";
}

/**
 * Create a per-chain transport that routes to RelayerWeb.
 *
 * @example
 * ```ts
 * createZamaConfig({
 *   chains: [sepolia],
 *   wagmiConfig,
 *   transports: {
 *     [sepolia.id]: fhevm("/api/relayer/11155111"),
 *   },
 * });
 * ```
 */
export interface FhevmTransportOverrides extends Partial<
  Omit<ExtendedFhevmInstanceConfig, "relayerUrl">
> {
  /** RelayerWeb security config (CSRF, integrity check). */
  security?: RelayerWebSecurityConfig;
  /** WASM thread count for parallel FHE operations. */
  threads?: number;
}

export interface FhevmTransport extends FhevmTransportOverrides {
  relayerUrl: string;
}

export function fhevm(relayerUrl: string, overrides?: FhevmTransportOverrides): FhevmTransport {
  return { relayerUrl, ...overrides };
}

/**
 * Create a per-chain transport that routes to RelayerCleartext.
 * For local dev and testnets without FHE infrastructure.
 *
 * @example
 * ```ts
 * import { hoodi } from "@zama-fhe/sdk/chains";
 * createZamaConfig({
 *   chains: [mainnet, hoodi],
 *   wagmiConfig,
 *   transports: {
 *     [mainnet.id]: fhevm("/api/relayer/1"),
 *     [hoodi.id]: cleartext("https://rpc.hoodi.ethpandaops.io", {
 *       executorAddress: "0x...",
 *     }),
 *   },
 * });
 * ```
 */
export function cleartext(
  network: CleartextConfig["network"],
  config: Omit<CleartextTransport, "__mode" | "network">,
): CleartextTransport {
  return { __mode: "cleartext", network, ...config };
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
  const getChainIdFn = resolveGetChainId(params, signer);
  const chainTransports = resolveChainTransports(params);

  return {
    relayer: buildRelayer(chainTransports, getChainIdFn),
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
