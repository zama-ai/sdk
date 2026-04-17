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
import type { TransportConfig } from "./transports";
import type { ZamaConfigCustomSigner, ZamaConfigEthers, ZamaConfigViem } from "./types";

// ── Storage defaults ─────────────────────────────────────────────────────────

const isBrowser = typeof window !== "undefined";
// @internal
let defaultStorage: GenericStorage | undefined;
// @internal
let defaultSessionStorage: GenericStorage | undefined;

function getDefaultStorage(): GenericStorage {
  return (defaultStorage ??= isBrowser
    ? new IndexedDBStorage("CredentialStore")
    : new MemoryStorage());
}

function getDefaultSessionStorage(): GenericStorage {
  return (defaultSessionStorage ??= isBrowser
    ? new IndexedDBStorage("SessionStore")
    : new MemoryStorage());
}

export function resolveStorage(
  storage: GenericStorage | undefined,
  sessionStorage: GenericStorage | undefined,
): { storage: GenericStorage; sessionStorage: GenericStorage } {
  return {
    storage: storage ?? getDefaultStorage(),
    sessionStorage: sessionStorage ?? getDefaultSessionStorage(),
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

const DEFAULT_WEB_TRANSPORT: TransportConfig = { type: "web" };

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

    if (userTransport?.type === "cleartext" || userTransport?.type === "custom") {
      if (!chainConfig) {
        throw new ConfigurationError(
          `Chain ${id} has a transport configured but no entry in the chains array. ` +
            `Add the chain config to the chains array.`,
        );
      }
      result.set(id, { chain: chainConfig, transport: userTransport });
      continue;
    }

    if (!chainConfig) {
      throw new ConfigurationError(
        `Chain ${id} has a transport configured but no entry in the chains array. ` +
          `Add the chain config to the chains array.`,
      );
    }

    if (userTransport && userTransport.type !== "web" && userTransport.type !== "node") {
      throw new ConfigurationError(
        `Chain ${id} has an unrecognized transport (type: ${JSON.stringify((userTransport as unknown as Record<string, unknown>).type)}). ` +
          `Use web(), node(), cleartext(), or custom() to create transports.`,
      );
    }

    const transport = userTransport ?? DEFAULT_WEB_TRANSPORT;
    result.set(id, { chain: chainConfig, transport });
  }

  if (transports) {
    const chainIdSet = new Set(chainIds);
    const orphaned = Object.keys(transports)
      .map(Number)
      .filter((id) => !chainIdSet.has(id));
    if (orphaned.length > 0) {
      throw new ConfigurationError(
        `Transport entries for chain(s) [${orphaned.join(", ")}] have no matching entry ` +
          `in the chains array or wagmi config. Remove them or add the corresponding chain config.`,
      );
    }
  }

  return result;
}

// ── Relayer building ─────────────────────────────────────────────────────────

export function buildRelayer(
  chainTransports: Map<number, ResolvedChainTransport>,
  resolveChainId: () => Promise<number>,
): RelayerSDK {
  if (chainTransports.size === 0) {
    throw new ConfigurationError(
      "No chain transports configured. Add at least one chain to the chains array.",
    );
  }

  const perChainRelayers = new Map<number, RelayerSDK>();

  for (const { chain, transport } of chainTransports.values()) {
    if (transport.type === "custom") {
      perChainRelayers.set(chain.chainId, transport.relayer);
      continue;
    }
    if (transport.type === "cleartext") {
      const merged = { ...chain, ...transport.chain } as CleartextConfig;
      perChainRelayers.set(chain.chainId, new RelayerCleartext(merged));
      continue;
    }

    const merged = { ...chain, ...transport.chain };
    if (!merged.relayerUrl) {
      throw new ConfigurationError(
        `Chain ${chain.chainId} has an empty relayerUrl. ` +
          `Use cleartext() for chains without a relayer.`,
      );
    }

    if (transport.type === "web") {
      perChainRelayers.set(chain.chainId, new RelayerWeb({ chain: merged, ...transport.relayer }));
      continue;
    }
    if (transport.type === "node") {
      perChainRelayers.set(chain.chainId, new RelayerNode({ chain: merged, ...transport.relayer }));
      continue;
    }

    const _exhaustive: never = transport;
    throw new ConfigurationError(
      `Unhandled transport type for chain ${chain.chainId}: ${JSON.stringify((_exhaustive as unknown as Record<string, unknown>).type)}`,
    );
  }

  return new CompositeRelayer(resolveChainId, perChainRelayers);
}
