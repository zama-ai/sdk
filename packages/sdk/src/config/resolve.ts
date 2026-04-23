import type { FheChain } from "../chains";
import { ConfigurationError } from "../errors";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { MemoryStorage } from "../storage/memory-storage";
import type { GenericStorage } from "../types";
import type { TransportConfig } from "./transports";

// ── Chain normalization ─────────────────────────────────────────────────────

/** Convert an `FheChain` (with `id`) to an `ExtendedFhevmInstanceConfig` (with `chainId`) for the relayer layer. */
function toFhevmConfig({ id, ...rest }: FheChain): ExtendedFhevmInstanceConfig {
  return { ...rest, chainId: id };
}

// ── Storage defaults ─────────────────────────────────────────────────────────

function getDefaultStorage(): GenericStorage {
  return typeof window !== "undefined"
    ? new IndexedDBStorage("CredentialStore")
    : new MemoryStorage();
}

function getDefaultSessionStorage(): GenericStorage {
  return typeof window !== "undefined" ? new IndexedDBStorage("SessionStore") : new MemoryStorage();
}

export function resolveStorage(
  storage: GenericStorage | undefined = getDefaultStorage(),
  sessionStorage: GenericStorage | undefined = getDefaultSessionStorage(),
): { storage: GenericStorage; sessionStorage: GenericStorage } {
  return { storage, sessionStorage };
}

// ── Chain transport resolution ───────────────────────────────────────────────

export interface ResolvedChainTransport {
  chain: ExtendedFhevmInstanceConfig;
  transport: TransportConfig;
}

export function resolveChainTransports(
  chains: readonly FheChain[],
  transports: Readonly<Record<number, TransportConfig>>,
): Map<number, ResolvedChainTransport> {
  const chainMap = new Map(chains.map((c) => [c.id, c]));
  if (chainMap.size !== chains.length) {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const c of chains) {
      if (seen.has(c.id)) {
        dupes.add(c.id);
      }
      seen.add(c.id);
    }
    throw new ConfigurationError(
      `Duplicate chain id(s) [${[...dupes].join(", ")}] in the chains array. ` +
        `Each chain id must appear only once. Note: hardhat and anvil are aliases (both use 31337).`,
    );
  }
  const transportMap = new Map(Object.entries(transports));
  const result = new Map<number, ResolvedChainTransport>();

  for (const id of chainMap.keys()) {
    const chainConfig = chainMap.get(id);
    const transportConfig = transportMap.get(String(id));

    if (!transportConfig) {
      throw new ConfigurationError(
        `Chain ${id} has no transport configured. ` +
          `Add a transport entry: transports: { [${id}]: web() }`,
      );
    }

    if (!chainConfig) {
      throw new ConfigurationError(
        `Chain ${id} has a transport configured but no entry in the chains array. ` +
          `Add the chain config to the chains array.`,
      );
    }

    if (
      transportConfig.type !== "web" &&
      transportConfig.type !== "node" &&
      transportConfig.type !== "cleartext"
    ) {
      throw new ConfigurationError(
        `Chain ${id} has an unrecognized transport (type: ${String((transportConfig as unknown as Record<string, unknown>).type)}). ` +
          `Use web(), node(), or cleartext() to create transports.`,
      );
    }

    result.set(id, {
      chain: toFhevmConfig(chainConfig),
      transport: transportConfig,
    });
  }

  const transportIdSet = new Set(Object.keys(transports).map(Number));
  const orphaned = transportIdSet.difference(new Set(chainMap.keys()));
  if (orphaned.size > 0) {
    throw new ConfigurationError(
      `Transport entries for chain(s) [${[...orphaned].join(", ")}] have no matching entry ` +
        `in the chains array. Remove them or add the corresponding chain config.`,
    );
  }

  return result;
}
