import type { FheChain } from "../chains";
import { ConfigurationError } from "../errors";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { MemoryStorage } from "../storage/memory-storage";
import type { LoggerService } from "../services/logger-service";
import type { GenericStorage } from "../types";
import type { RelayerConfig } from "./types";

// ── Storage defaults ─────────────────────────────────────────────────────────

function getDefaultStorage(): GenericStorage {
  return typeof window !== "undefined"
    ? new IndexedDBStorage("CredentialStore")
    : new MemoryStorage();
}

/** @internal */
export function resolveStorage(
  storage: GenericStorage | undefined = getDefaultStorage(),
  permitStorage: GenericStorage | undefined = storage,
): { storage: GenericStorage; permitStorage: GenericStorage } {
  return { storage, permitStorage };
}

// ── Chain relayer resolution ────────────────────────────────────────────────

/** @internal */
export interface ResolvedChainRelayer {
  chain: FheChain;
  relayerConfig: RelayerConfig;
}

/** @internal */
export function resolveChainRelayers(
  chains: readonly FheChain[],
  relayers: Readonly<Record<number, RelayerConfig>>,
  logger: LoggerService,
): Map<number, ResolvedChainRelayer> {
  const ids = chains.map((c) => c.id);
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length > 0) {
    throw new ConfigurationError(
      `Duplicate chain id(s) [${dupes.join(", ")}] in the chains array. ` +
        `Each chain id must appear only once. Note: hardhat and anvil are aliases (both use 31337).`,
    );
  }

  const orphaned = Object.keys(relayers)
    .map(Number)
    .filter((id) => !ids.includes(id));
  if (orphaned.length > 0) {
    logger.warn(
      `Relayer entries for chain(s) [${orphaned.join(", ")}] are ignored: those chains are not in ` +
        `the chains array. Add the chain config to use them, or drop the relayer entries.`,
    );
  }

  const result = new Map<number, ResolvedChainRelayer>();
  for (const chain of chains) {
    const relayerConfig = relayers[chain.id];
    if (!relayerConfig) {
      throw new ConfigurationError(
        `Chain ${chain.id} has no relayer configured. ` +
          `Add a relayer entry: relayers: { [${chain.id}]: web() }`,
      );
    }
    result.set(chain.id, { chain, relayerConfig });
  }

  return result;
}
