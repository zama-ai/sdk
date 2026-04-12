import type { Address } from "viem";
import type { GenericSigner, GenericStorage } from "./types";
import type { RelayerSDK } from "./relayer/relayer-sdk";
import type { RelayerWebSecurityConfig } from "./relayer/relayer-sdk.types";
import type { ZamaSDKEventListener } from "./events";
import type { ExtendedFhevmInstanceConfig } from "./relayer/relayer-utils";
import type { CleartextConfig } from "./relayer/cleartext/types";
import { RelayerWeb } from "./relayer/relayer-web";
import { RelayerCleartext } from "./relayer/cleartext/relayer-cleartext";
import { CompositeRelayer } from "./relayer/composite-relayer";
import { MemoryStorage } from "./storage/memory-storage";
import { IndexedDBStorage } from "./storage/indexeddb-storage";
import { ConfigurationError } from "./errors";

// ── Transport types ──────────────────────────────────────────────────────────

/** Tagged transport: routes to RelayerCleartext. */
export interface CleartextTransport {
  readonly __mode: "cleartext";
  network: CleartextConfig["network"];
  executorAddress: CleartextConfig["executorAddress"];
  kmsSignerPrivateKey?: CleartextConfig["kmsSignerPrivateKey"];
  inputSignerPrivateKey?: CleartextConfig["inputSignerPrivateKey"];
}

/** A per-chain transport entry — either fhevm (default) or cleartext mode. */
export type TransportConfig = Partial<ExtendedFhevmInstanceConfig> | CleartextTransport;

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

/**
 * Create a per-chain transport for real FHE operations via RelayerWeb.
 *
 * @example
 * ```ts
 * createZamaConfig({
 *   chains: [sepolia],
 *   signer,
 *   transports: {
 *     [sepolia.id]: fhevm("https://relayer.testnet.zama.org/v2"),
 *   },
 * });
 * ```
 */
export function fhevm(relayerUrl: string, overrides?: FhevmTransportOverrides): FhevmTransport {
  return { relayerUrl, ...overrides };
}

/**
 * Create a per-chain transport for cleartext mode (no FHE infrastructure needed).
 * For local dev and testnets without FHE.
 *
 * @example
 * ```ts
 * import { hardhat } from "@zama-fhe/sdk/chains";
 * createZamaConfig({
 *   chains: [hardhat],
 *   signer,
 *   transports: {
 *     [hardhat.id]: cleartext("http://127.0.0.1:8545", {
 *       executorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
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

// ── Config types ─────────────────────────────────────────────────────────────

/** Shared options across all adapter paths. */
export interface ZamaConfigBase {
  /** FHE chain configurations. Defines which chains support FHE operations. */
  chains: ExtendedFhevmInstanceConfig[];
  /** Per-chain transport configuration. */
  transports?: Record<number, TransportConfig>;
  /** Credential storage. Default: IndexedDB in browser, memory in Node. */
  storage?: GenericStorage;
  /** Session storage. Default: IndexedDB in browser, memory in Node. */
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

/** Custom GenericSigner with explicit transports. */
export interface ZamaConfigCustomSigner extends ZamaConfigBase {
  signer: GenericSigner;
  relayer?: never;
  transports: Record<number, TransportConfig>;
}

/** Pre-built relayer — bring your own RelayerSDK. */
export interface ZamaConfigCustomRelayer extends Omit<ZamaConfigBase, "transports" | "chains"> {
  relayer: RelayerSDK;
  signer: GenericSigner;
}

/** Base config params (no framework-specific adapters). */
export type CreateZamaConfigBaseParams = ZamaConfigCustomSigner | ZamaConfigCustomRelayer;

/** Opaque config object returned by {@link createZamaConfig}. */
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

// ── Internal resolution ──────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";
const defaultStorage = isBrowser ? new IndexedDBStorage("CredentialStore") : new MemoryStorage();
const defaultSessionStorage = isBrowser
  ? new IndexedDBStorage("SessionStore")
  : new MemoryStorage();

function isCleartextTransport(t: TransportConfig): t is CleartextTransport {
  return "__mode" in t && t.__mode === "cleartext";
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

/** Resolve per-chain transport entries by merging chain defaults with user overrides. */
export function resolveChainTransports(
  chains: ExtendedFhevmInstanceConfig[],
  transports: Record<number, TransportConfig> | undefined,
  chainIds: number[],
  chainNameResolver?: (id: number) => string | number,
): Map<number, { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }> {
  const chainMap = new Map(chains.map((c) => [c.chainId, c]));
  const result = new Map<
    number,
    { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }
  >();

  for (const id of chainIds) {
    const chainConfig = chainMap.get(id);
    const userTransport = transports?.[id];

    if (!chainConfig && !userTransport) {
      const name = chainNameResolver?.(id) ?? id;
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

/** Build the appropriate RelayerSDK from resolved chain transports. */
export function buildRelayer(
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
      if (s) {security = s;}
      if (t) {threads = t;}
      webTransports[chainId] = fhevmConfig;
    }
  }

  if (cleartextRelayers.size === 0) {
    return new RelayerWeb({
      getChainId: resolveChainId,
      transports: webTransports,
      security,
      threads,
    });
  }

  if (Object.keys(webTransports).length === 0) {
    return new CompositeRelayer(resolveChainId, cleartextRelayers as Map<number, RelayerSDK>);
  }

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

function buildConfig(
  relayer: RelayerSDK,
  signer: GenericSigner,
  storage: GenericStorage,
  sessionStorage: GenericStorage,
  params: {
    keypairTTL?: number;
    sessionTTL?: number | "infinite";
    registryAddresses?: Record<number, Address>;
    registryTTL?: number;
    onEvent?: ZamaSDKEventListener;
  },
): ZamaConfig {
  return {
    relayer,
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

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a {@link ZamaConfig} that wires together relayer, signer, and storage.
 *
 * @example
 * ```ts
 * import { sepolia } from "@zama-fhe/sdk/chains";
 * const config = createZamaConfig({
 *   chains: [sepolia],
 *   signer,
 *   transports: { [sepolia.id]: fhevm("https://relayer.testnet.zama.org/v2") },
 * });
 * const sdk = new ZamaSDK(config);
 * ```
 */
export function createZamaConfig(params: CreateZamaConfigBaseParams): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);

  if ("relayer" in params && params.relayer) {
    return buildConfig(params.relayer, params.signer, storage, sessionStorage, params);
  }

  const p = params as ZamaConfigCustomSigner;
  const chainTransports = resolveChainTransports(
    p.chains,
    p.transports,
    p.chains.map((c) => c.chainId),
  );
  const relayer = buildRelayer(chainTransports, () => p.signer.getChainId());

  return buildConfig(relayer, p.signer, storage, sessionStorage, p);
}
