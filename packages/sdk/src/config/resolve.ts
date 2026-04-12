import type { Address } from "viem";
import type { GenericSigner, GenericStorage } from "../types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { CleartextConfig } from "../relayer/cleartext/types";
import { RelayerWeb } from "../relayer/relayer-web";
import { RelayerNode } from "../relayer/relayer-node";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import { CompositeRelayer } from "../relayer/composite-relayer";
import { MemoryStorage } from "../storage/memory-storage";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { ConfigurationError } from "../errors";
import { ViemSigner } from "../viem";
import { EthersSigner } from "../ethers";
import type { TransportConfig, WebTransportConfig, NodeTransportConfig } from "./transports";
import { isWebTransport, isNodeTransport, isCleartextTransport } from "./transports";
import type { ZamaConfigViem, ZamaConfigEthers, ZamaConfigCustomSigner } from "./types";

// ── Storage defaults ─────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";
const defaultStorage = isBrowser ? new IndexedDBStorage("CredentialStore") : new MemoryStorage();
const defaultSessionStorage = isBrowser
  ? new IndexedDBStorage("SessionStore")
  : new MemoryStorage();

export function resolveStorage(
  storage: GenericStorage | undefined,
  sessionStorage: GenericStorage | undefined,
): { storage: GenericStorage; sessionStorage: GenericStorage } {
  return {
    storage: storage ?? defaultStorage,
    sessionStorage: sessionStorage ?? defaultSessionStorage,
  };
}

// ── Signer resolution ────────────────────────────────────────────────────────

export type ConfigWithTransports = ZamaConfigViem | ZamaConfigEthers | ZamaConfigCustomSigner;

export function resolveSigner(params: ConfigWithTransports): GenericSigner {
  if ("viem" in params && params.viem) {
    return new ViemSigner(params.viem);
  }
  if ("ethers" in params && params.ethers) {
    return new EthersSigner(params.ethers);
  }
  return params.signer;
}

// ── Chain transport resolution ───────────────────────────────────────────────

export function resolveChainTransports(
  chains: ExtendedFhevmInstanceConfig[],
  transports: Record<number, TransportConfig> | undefined,
  chainIds: number[],
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
      throw new ConfigurationError(
        `Chain ${id} has no FHE chain config in the chains array and no transport override. ` +
          `Add it to chains or provide a transport.`,
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
      if (userTransport && (isWebTransport(userTransport) || isNodeTransport(userTransport))) {
        result.set(id, { chain: chainConfig, transport: userTransport });
      } else {
        // No transport specified — default to web
        result.set(id, { chain: chainConfig, transport: { __mode: "web" as const } });
      }
    }
  }

  return result;
}

// ── Relayer building ─────────────────────────────────────────────────────────

function buildCleartextRelayer(
  chain: ExtendedFhevmInstanceConfig,
  transport: {
    network?: CleartextConfig["network"];
    executorAddress: CleartextConfig["executorAddress"];
    kmsSignerPrivateKey?: CleartextConfig["kmsSignerPrivateKey"];
    inputSignerPrivateKey?: CleartextConfig["inputSignerPrivateKey"];
  },
): RelayerCleartext {
  return new RelayerCleartext({
    chainId: chain.chainId,
    gatewayChainId: chain.gatewayChainId,
    aclContractAddress: chain.aclContractAddress as Address,
    verifyingContractAddressDecryption: chain.verifyingContractAddressDecryption as Address,
    verifyingContractAddressInputVerification:
      chain.verifyingContractAddressInputVerification as Address,
    registryAddress: chain.registryAddress,
    network: (transport.network ?? chain.network) as CleartextConfig["network"],
    executorAddress: transport.executorAddress,
    kmsSignerPrivateKey: transport.kmsSignerPrivateKey,
    inputSignerPrivateKey: transport.inputSignerPrivateKey,
  });
}

export function buildRelayer(
  chainTransports: Map<number, { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  const webChains: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
  const nodeChains: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
  const perChainRelayers = new Map<number, RelayerSDK>();

  let webSecurity: WebTransportConfig["security"];
  let webThreads: WebTransportConfig["threads"];
  let nodePoolSize: NodeTransportConfig["poolSize"];
  let nodeLogger: NodeTransportConfig["logger"];
  let nodeFheArtifactStorage: NodeTransportConfig["fheArtifactStorage"];
  let nodeFheArtifactCacheTTL: NodeTransportConfig["fheArtifactCacheTTL"];

  for (const [chainId, { chain, transport }] of chainTransports) {
    if (isCleartextTransport(transport)) {
      perChainRelayers.set(chainId, buildCleartextRelayer(chain, transport));
    } else if (isNodeTransport(transport)) {
      const {
        __mode: _,
        poolSize,
        logger,
        fheArtifactStorage,
        fheArtifactCacheTTL,
        ...rest
      } = transport;
      if (poolSize) {nodePoolSize = poolSize;}
      if (logger) {nodeLogger = logger;}
      if (fheArtifactStorage) {nodeFheArtifactStorage = fheArtifactStorage;}
      if (fheArtifactCacheTTL) {nodeFheArtifactCacheTTL = fheArtifactCacheTTL;}
      nodeChains[chainId] = { ...chain, ...rest };
    } else {
      // web transport (default)
      const { __mode: _, security, threads, ...rest } = transport as WebTransportConfig;
      if (security) {webSecurity = security;}
      if (threads) {webThreads = threads;}
      webChains[chainId] = { ...chain, ...rest };
    }
  }

  // Build shared relayers for web and node chains
  const hasWeb = Object.keys(webChains).length > 0;
  const hasNode = Object.keys(nodeChains).length > 0;

  if (hasWeb) {
    const webRelayer = new RelayerWeb({
      getChainId: resolveChainId,
      transports: webChains,
      security: webSecurity,
      threads: webThreads,
    });
    for (const id of Object.keys(webChains)) {
      perChainRelayers.set(Number(id), webRelayer);
    }
  }

  if (hasNode) {
    const nodeRelayer = new RelayerNode({
      getChainId: resolveChainId,
      transports: nodeChains,
      poolSize: nodePoolSize,
      logger: nodeLogger,
      fheArtifactStorage: nodeFheArtifactStorage,
      fheArtifactCacheTTL: nodeFheArtifactCacheTTL,
    });
    for (const id of Object.keys(nodeChains)) {
      perChainRelayers.set(Number(id), nodeRelayer);
    }
  }

  // Single relayer — no dispatch needed
  const uniqueRelayers = [...new Set(perChainRelayers.values())];
  if (uniqueRelayers.length === 1 && uniqueRelayers[0]) {
    return uniqueRelayers[0];
  }

  // Mixed — dispatch by chain
  return new CompositeRelayer(resolveChainId, perChainRelayers);
}
