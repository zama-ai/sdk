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
import type { TransportConfig } from "./transports";
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
        result.set(id, {
          chain: chainConfig,
          transport: { __mode: "web" as const },
        });
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

/**
 * Fields on a transport config that map to per-chain FHE instance config
 * (e.g. relayerUrl, network, contract addresses). Everything else is a
 * relayer-level option shared across all chains using the same relayer.
 */
const FHEVM_INSTANCE_KEYS = new Set<string>([
  "chainId",
  "gatewayChainId",
  "relayerUrl",
  "network",
  "aclContractAddress",
  "kmsContractAddress",
  "inputVerifierContractAddress",
  "verifyingContractAddressDecryption",
  "verifyingContractAddressInputVerification",
  "registryAddress",
  "batchRpcCalls",
  "relayerRouteVersion",
  "publicKey",
  "publicParams",
  "auth",
  "debug",
]);

function splitTransport(transport: TransportConfig): {
  chainFields: Record<string, unknown>;
  relayerFields: Record<string, unknown>;
} {
  const chainFields: Record<string, unknown> = {};
  const relayerFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(transport)) {
    if (key === "__mode") {
      continue;
    }
    if (FHEVM_INSTANCE_KEYS.has(key)) {
      chainFields[key] = value;
    } else {
      relayerFields[key] = value;
    }
  }
  return { chainFields, relayerFields };
}

interface ChainEntry {
  chainId: number;
  chain: ExtendedFhevmInstanceConfig;
  chainFields: Record<string, unknown>;
  options: Record<string, unknown>;
}

/**
 * Stable key for grouping entries by relayer options.
 * Uses reference identity for non-serializable values (functions, class instances)
 * so different callbacks never collide into the same group.
 */
function optionsKey(options: Record<string, unknown>): string {
  const refIds = new WeakMap<WeakKey, number>();
  let nextId = 0;
  const refId = (v: WeakKey) => {
    let id = refIds.get(v);
    if (id === undefined) {
      id = nextId++;
      refIds.set(v, id);
    }
    return id;
  };
  return JSON.stringify(options, (_key, value: unknown) => {
    if (typeof value === "function") {return `__ref:${refId(value as WeakKey)}`;}
    if (value && typeof value === "object" && !Array.isArray(value)) {
      // Sort object keys for stable serialization, and tag class instances.
      const proto = Object.getPrototypeOf(value);
      if (proto !== Object.prototype && proto !== null) {
        return `__ref:${refId(value as WeakKey)}`;
      }
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) => a.localeCompare(b)),
      );
    }
    return value;
  });
}

export function buildRelayer(
  chainTransports: Map<number, { chain: ExtendedFhevmInstanceConfig; transport: TransportConfig }>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  const perChainRelayers = new Map<number, RelayerSDK>();
  const webEntries: ChainEntry[] = [];
  const nodeEntries: ChainEntry[] = [];

  for (const [chainId, { chain, transport }] of chainTransports) {
    if (isCleartextTransport(transport)) {
      perChainRelayers.set(chainId, buildCleartextRelayer(chain, transport));
      continue;
    }
    const { chainFields, relayerFields } = splitTransport(transport);
    const entry: ChainEntry = { chainId, chain, chainFields, options: relayerFields };
    (isNodeTransport(transport) ? nodeEntries : webEntries).push(entry);
  }

  const buildGroup = <T extends RelayerSDK>(
    entries: ChainEntry[],
    Relayer: new (config: {
      getChainId: () => Promise<number>;
      transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
    }) => T,
  ) => {
    const groups = Object.groupBy(entries, (e) => optionsKey(e.options));
    for (const group of Object.values(groups)) {
      const [first, ...rest] = group ?? [];
      if (!first) {
        continue;
      }
      const transports: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
      for (const entry of [first, ...rest]) {
        transports[entry.chainId] = { ...entry.chain, ...entry.chainFields };
      }
      const relayer = new Relayer({
        getChainId: resolveChainId,
        transports,
        ...first.options,
      });
      for (const entry of [first, ...rest]) {
        perChainRelayers.set(entry.chainId, relayer);
      }
    }
  };

  buildGroup(webEntries, RelayerWeb);
  buildGroup(nodeEntries, RelayerNode);

  // Single relayer — no dispatch needed
  const uniqueRelayers = [...new Set(perChainRelayers.values())];
  if (uniqueRelayers.length === 1 && uniqueRelayers[0]) {
    return uniqueRelayers[0];
  }

  // Mixed — dispatch by chain
  return new CompositeRelayer(resolveChainId, perChainRelayers);
}
