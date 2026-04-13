import type { GenericSigner, GenericStorage } from "../types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { CleartextConfig } from "../relayer/cleartext/types";
import { CompositeRelayer } from "../relayer/composite-relayer";
import { RelayerCleartext } from "../relayer/cleartext/relayer-cleartext";
import { RelayerNode } from "../relayer/relayer-node";
import { RelayerWeb } from "../relayer/relayer-web";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { MemoryStorage } from "../storage/memory-storage";
import { ConfigurationError } from "../errors";
import { EthersSigner } from "../ethers";
import { ViemSigner } from "../viem";
import type { NodeTransportConfig, TransportConfig, WebTransportConfig } from "./transports";
import type { ZamaConfigCustomSigner, ZamaConfigEthers, ZamaConfigViem } from "./types";

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

export interface ResolvedChainTransport {
  chain: ExtendedFhevmInstanceConfig;
  transport: TransportConfig;
}

const DEFAULT_WEB_TRANSPORT: TransportConfig = { __mode: "web" };

export function resolveChainTransports(
  chains: ExtendedFhevmInstanceConfig[],
  transports: Record<number, TransportConfig> | undefined,
  chainIds: number[],
): Map<number, ResolvedChainTransport> {
  const chainMap = new Map(chains.map((c) => [c.chainId, c]));
  const result = new Map<number, ResolvedChainTransport>();

  for (const id of chainIds) {
    const chainConfig = chainMap.get(id);
    const userTransport = transports?.[id];

    if (!chainConfig && !userTransport) {
      throw new ConfigurationError(
        `Chain ${id} has no FHE chain config in the chains array and no transport override. ` +
          `Add it to chains or provide a transport.`,
      );
    }

    if (userTransport?.__mode === "cleartext") {
      if (!chainConfig) {
        throw new ConfigurationError(
          `Chain ${id} uses cleartext transport but has no entry in the chains array. ` +
            `Add the chain config to the chains array.`,
        );
      }
      result.set(id, { chain: chainConfig, transport: userTransport });
      continue;
    }

    // Web/node transports require a chain config. Silently skip if missing —
    // the chain was declared in `transports` but not `chains`, nothing to build.
    if (!chainConfig) {
      continue;
    }

    // Only accept properly tagged web/node transports. Untagged values (e.g.
    // raw chain configs passed as transports) fall back to the default web
    // transport — their fields come from the `chains` array instead.
    const isHttp = userTransport?.__mode === "web" || userTransport?.__mode === "node";
    const transport = isHttp ? userTransport : DEFAULT_WEB_TRANSPORT;
    result.set(id, { chain: chainConfig, transport });
  }

  return result;
}

// ── Relayer building ─────────────────────────────────────────────────────────

interface ChainEntry {
  /** Merged per-chain FHE instance config (base chain + transport overrides). */
  chain: ExtendedFhevmInstanceConfig;
  /** Shared relayer-pool options. Reference identity controls grouping. */
  relayer: Record<string, unknown> | undefined;
}

/**
 * Group entries by `relayer` reference. Chains that share the same `relayer`
 * object (including `undefined` — the common "no options" case) reuse a single
 * relayer instance. Distinct references always produce distinct relayers.
 */
function groupByRelayer(entries: ChainEntry[]): ChainEntry[][] {
  const groups = new Map<object | undefined, ChainEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.relayer);
    if (group) {
      group.push(entry);
    } else {
      groups.set(entry.relayer, [entry]);
    }
  }
  return [...groups.values()];
}

type HttpRelayerCtor<T extends RelayerSDK> = new (config: {
  getChainId: () => Promise<number>;
  transports: Record<number, Partial<ExtendedFhevmInstanceConfig>>;
}) => T;

function buildHttpGroup<T extends RelayerSDK>(
  Relayer: HttpRelayerCtor<T>,
  entries: ChainEntry[],
  resolveChainId: () => Promise<number>,
): Array<[number, RelayerSDK]> {
  const pairs: Array<[number, RelayerSDK]> = [];
  for (const group of groupByRelayer(entries)) {
    const first = group[0];
    if (!first) {
      continue;
    }
    const transports: Record<number, Partial<ExtendedFhevmInstanceConfig>> = {};
    for (const entry of group) {
      transports[entry.chain.chainId] = entry.chain;
    }
    const relayer = new Relayer({
      getChainId: resolveChainId,
      transports,
      ...first.relayer,
    });
    for (const entry of group) {
      pairs.push([entry.chain.chainId, relayer]);
    }
  }
  return pairs;
}

function toChainEntry(
  chain: ExtendedFhevmInstanceConfig,
  transport: WebTransportConfig | NodeTransportConfig,
): ChainEntry {
  return {
    chain: { ...chain, ...transport.chain },
    relayer: transport.relayer,
  };
}

export function buildRelayer(
  chainTransports: Map<number, ResolvedChainTransport>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  const perChainRelayers = new Map<number, RelayerSDK>();
  const webEntries: ChainEntry[] = [];
  const nodeEntries: ChainEntry[] = [];

  for (const { chain, transport } of chainTransports.values()) {
    if (transport.__mode === "cleartext") {
      perChainRelayers.set(
        chain.chainId,
        new RelayerCleartext({
          ...chain,
          ...transport.chain,
        } as CleartextConfig),
      );
      continue;
    }
    if (transport.__mode === "web") {
      webEntries.push(toChainEntry(chain, transport));
    }
    if (transport.__mode === "node") {
      nodeEntries.push(toChainEntry(chain, transport));
    }
  }

  for (const [chainId, relayer] of buildHttpGroup(RelayerWeb, webEntries, resolveChainId)) {
    perChainRelayers.set(chainId, relayer);
  }
  for (const [chainId, relayer] of buildHttpGroup(RelayerNode, nodeEntries, resolveChainId)) {
    perChainRelayers.set(chainId, relayer);
  }

  const uniqueRelayers = new Set(perChainRelayers.values());
  if (uniqueRelayers.size === 1) {
    const [only] = uniqueRelayers;
    if (only) {
      return only;
    }
  }

  return new CompositeRelayer(resolveChainId, perChainRelayers);
}
