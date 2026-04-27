import type { FheChain } from "../chains";
import { ConfigurationError } from "../errors";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { MemoryStorage } from "../storage/memory-storage";
import type { GenericStorage } from "../types";
import type { RelayerConfig } from "./relayers";

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

// ── Chain relayer resolution ────────────────────────────────────────────────

export interface ResolvedChainRelayer {
  chain: FheChain;
  relayer: RelayerConfig;
}

export function resolveChainRelayers(
  chains: readonly FheChain[],
  relayers: Readonly<Record<number, RelayerConfig>>,
): Map<number, ResolvedChainRelayer> {
  const chainMap = new Map(chains.map((c) => [c.id, c]));
  if (chainMap.size !== chains.length) {
    const ids = chains.map((c) => c.id);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    throw new ConfigurationError(
      `Duplicate chain id(s) [${dupes.join(", ")}] in the chains array. ` +
        `Each chain id must appear only once. Note: hardhat and anvil are aliases (both use 31337).`,
    );
  }
  const relayerMap = new Map(Object.entries(relayers));
  const result = new Map<number, ResolvedChainRelayer>();

  for (const id of chainMap.keys()) {
    const chainConfig = chainMap.get(id);
    const relayerConfig = relayerMap.get(String(id));

    if (!relayerConfig) {
      throw new ConfigurationError(
        `Chain ${id} has no relayer configured. ` +
          `Add a relayer entry: relayers: { [${id}]: web() }`,
      );
    }

    if (!chainConfig) {
      throw new ConfigurationError(
        `Chain ${id} has a relayer configured but no entry in the chains array. ` +
          `Add the chain config to the chains array.`,
      );
    }

    result.set(id, {
      chain: chainConfig,
      relayer: relayerConfig,
    });
  }

  const relayerIdSet = new Set(Object.keys(relayers).map(Number));
  const orphaned = new Set([...relayerIdSet].filter((id) => !chainMap.has(id)));
  if (orphaned.size > 0) {
    throw new ConfigurationError(
      `Relayer entries for chain(s) [${[...orphaned].join(", ")}] have no matching entry ` +
        `in the chains array. Remove them or add the corresponding chain config.`,
    );
  }

  return result;
}
