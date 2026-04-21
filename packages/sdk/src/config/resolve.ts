import type { FheChain } from "../chains";
import { ConfigurationError } from "../errors";
import { EthersSigner } from "../ethers";
import type { CleartextConfig } from "../relayer/cleartext/types";
import { CompositeRelayer } from "../relayer/composite-relayer";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import { IndexedDBStorage } from "../storage/indexeddb-storage";
import { MemoryStorage } from "../storage/memory-storage";
import type { GenericSigner, GenericStorage } from "../types";
import { ViemSigner } from "../viem";
import type { TransportConfig } from "./transports";
import type { ZamaConfigCustomSigner, ZamaConfigEthers, ZamaConfigViem } from "./types";

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
  chains: FheChain[],
  transports: Record<number, TransportConfig> | undefined,
  chainIds: number[],
): Map<number, ResolvedChainTransport> {
  const chainMap = new Map(chains.map((c) => [c.id, c]));
  const transportMap = new Map(Object.entries(transports ?? {}));
  const result = new Map<number, ResolvedChainTransport>();

  for (const id of chainIds) {
    const chainConfig = chainMap.get(id);
    const userTransport = transportMap.get(String(id));

    if (!chainConfig && !userTransport) {
      throw new ConfigurationError(
        `Chain ${id} has no FHE chain config in the chains array and no transport override. ` +
          `Add it to chains or provide a transport.`,
      );
    }

    if (userTransport?.type === "cleartext") {
      if (!chainConfig) {
        throw new ConfigurationError(
          `Chain ${id} has a transport configured but no entry in the chains array. ` +
            `Add the chain config to the chains array.`,
        );
      }
      result.set(id, {
        chain: toFhevmConfig(chainConfig),
        transport: userTransport,
      });
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
          `Use web(), node(), or cleartext() to create transports.`,
      );
    }

    const transport = userTransport ?? DEFAULT_WEB_TRANSPORT;
    result.set(id, { chain: toFhevmConfig(chainConfig), transport });
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

// ── Transport handler registry ──────────────────────────────────────────────

type RelayerSDKFn = (
  chain: ExtendedFhevmInstanceConfig,
  transport: TransportConfig,
) => Promise<RelayerSDK>;

const relayerSDKMap = new Map<string, RelayerSDKFn>();

/** Register a transport handler. Called by sub-path modules (e.g. `@zama-fhe/sdk/node`). */
export function registerRelayer(type: string, handler: RelayerSDKFn): void {
  relayerSDKMap.set(type, handler);
}

// Built-in handlers (browser-safe — no node:worker_threads references)
registerRelayer("web", async (chain, transport) => {
  if (transport.type !== "web") {
    throw new Error("unreachable");
  }
  const merged = { ...chain, ...transport.chain };
  if (!merged.relayerUrl) {
    throw new ConfigurationError(
      `Chain ${chain.chainId} has an empty relayerUrl. Use cleartext() for chains without a relayer.`,
    );
  }
  const m = await import("../relayer/relayer-web");
  return new m.RelayerWeb({ chain: merged, ...transport.relayer });
});

registerRelayer("cleartext", async (chain, transport) => {
  if (transport.type !== "cleartext") {
    throw new Error("unreachable");
  }
  const merged = { ...chain, ...transport.chain } as CleartextConfig;
  const m = await import("../relayer/cleartext/relayer-cleartext");
  return new m.RelayerCleartext(merged);
});

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

  const perChainRelayers = new Map<number, Promise<RelayerSDK>>();

  for (const { chain, transport } of chainTransports.values()) {
    const handler = relayerSDKMap.get(transport.type);
    if (!handler) {
      const hint =
        transport.type === "node"
          ? ' Import "@zama-fhe/sdk/node" to enable Node.js transports.'
          : "";
      throw new ConfigurationError(
        `No transport handler registered for type "${transport.type}".${hint}`,
      );
    }
    perChainRelayers.set(chain.chainId, handler(chain, transport));
  }

  return new CompositeRelayer(resolveChainId, perChainRelayers);
}
