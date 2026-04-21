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

// ── Chain transport resolution ───────────────────────────────────────────────

export interface ResolvedChainTransport {
  chain: ExtendedFhevmInstanceConfig;
  transport: TransportConfig;
}

export function resolveChainTransports(
  chains: readonly FheChain[],
  transports: Readonly<Record<number, TransportConfig>>,
  chainIds: readonly number[],
): Map<number, ResolvedChainTransport> {
  const chainMap = new Map(chains.map((c) => [c.id, c]));
  const transportMap = new Map(Object.entries(transports));
  const result = new Map<number, ResolvedChainTransport>();

  for (const id of chainIds) {
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
        `Chain ${id} has an unrecognized transport (type: ${JSON.stringify((transportConfig as unknown as Record<string, unknown>).type)}). ` +
          `Use web(), node(), or cleartext() to create transports.`,
      );
    }

    result.set(id, {
      chain: toFhevmConfig(chainConfig),
      transport: transportConfig,
    });
  }

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

  return result;
}
