import type { FheChain } from "../chains";
import { RelayerDispatcher, type WorkerLike } from "../relayer/relayer-dispatcher";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import type { GenericProvider, GenericSigner } from "../types";
import { resolveChainTransports, resolveStorage } from "./resolve";
import type { TransportConfig } from "./transports";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/** Merge transport-level `registryAddress` overrides into chain definitions. */
function mergeRegistryAddresses(
  chains: readonly FheChain[],
  transports: Readonly<Record<number, TransportConfig>>,
): readonly FheChain[] {
  return chains.map((chain) => {
    const registryAddress = transports[chain.id]?.chain?.registryAddress;
    if (registryAddress && registryAddress !== chain.registryAddress) {
      return { ...chain, registryAddress };
    }
    return chain;
  });
}

/**
 * @internal Shared config builder — not part of the public API.
 *
 * Groups chains by transport reference identity, calls `createWorker`
 * once per group, then `createRelayer` per chain with the shared worker.
 */
export function buildZamaConfig(
  signer: GenericSigner,
  provider: GenericProvider,
  params: ZamaConfigBase,
): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chains = mergeRegistryAddresses(params.chains, params.transports);
  const chainTransports = resolveChainTransports(chains, params.transports);

  // Group chains by transport reference — same object = same group = shared worker.
  const groups = new Map<TransportConfig, Array<[number, ExtendedFhevmInstanceConfig]>>();
  for (const [chainId, config] of chainTransports) {
    const key = config.transport;
    const mergedChain = { ...config.chain, ...key.chain };
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push([chainId, mergedChain]);
  }

  // For each group: create shared worker once, then create per-chain relayers.
  const relayersMap = new Map<number, RelayerSDK>();
  const workers: WorkerLike[] = [];
  for (const [transport, groupChains] of groups) {
    const allChainConfigs = groupChains.map(([, chain]) => chain);
    const worker = transport.createWorker?.(allChainConfigs);
    if (worker) {
      workers.push(worker);
    }
    for (const [chainId, chain] of groupChains) {
      relayersMap.set(chainId, transport.createRelayer(chain, worker));
    }
  }

  const chainsMap = new Map(chains.map((c) => [c.id, c]));
  const relayer = new RelayerDispatcher(chainsMap, relayersMap, workers);

  return {
    chains,
    relayer,
    provider,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  };
}
