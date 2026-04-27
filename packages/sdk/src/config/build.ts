import type { FheChain } from "../chains";
import { RelayerDispatcher, type WorkerLike } from "../relayer/relayer-dispatcher";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { GenericProvider, GenericSigner } from "../types";
import { resolveChainRelayers, resolveStorage } from "./resolve";
import type { RelayerConfig } from "./transports";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/** Merge relayer-level `registryAddress` overrides into chain definitions. */
function mergeRegistryAddresses(
  chains: readonly FheChain[],
  relayers: Readonly<Record<number, RelayerConfig>>,
): readonly FheChain[] {
  return chains.map((chain) => {
    const registryAddress = relayers[chain.id]?.chain?.registryAddress;
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
  const chains = mergeRegistryAddresses(params.chains, params.relayers);
  const chainRelayers = resolveChainRelayers(chains, params.relayers);

  // Group chains by relayer reference — same object = same group = shared worker.
  const groups = new Map<RelayerConfig, Array<[number, FheChain]>>();
  for (const [chainId, config] of chainRelayers) {
    const key = config.relayer;
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
  try {
    for (const [relayerCfg, groupChains] of groups) {
      const allChainConfigs = groupChains.map(([, chain]) => chain);
      const worker = relayerCfg.createWorker?.(allChainConfigs);
      if (worker) {
        workers.push(worker);
      }
      for (const [chainId, chain] of groupChains) {
        relayersMap.set(chainId, relayerCfg.createRelayer(chain, worker));
      }
    }
  } catch (error) {
    for (const w of workers) {
      try {
        w.terminate();
      } catch {
        /* best-effort cleanup */
      }
    }
    throw error;
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
