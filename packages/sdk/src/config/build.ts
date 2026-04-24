import type { FheChain } from "../chains";
import { CompositeRelayer } from "../relayer/composite-relayer";
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
 * Each entry point (`/viem`, `/ethers`, wagmi) creates its signer,
 * then delegates here for the common resolution work.
 */
export function buildZamaConfig(
  signer: GenericSigner,
  provider: GenericProvider,
  params: ZamaConfigBase,
): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chains = mergeRegistryAddresses(params.chains, params.transports);
  const chainTransports = resolveChainTransports(chains, params.transports);
  const relayer = new CompositeRelayer(() => signer.getChainId(), chainTransports);

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
