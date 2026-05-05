import { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericProvider, GenericSigner } from "../types";
import { resolveStorage } from "./resolve";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/**
 * @internal Shared config builder — not part of the public API.
 */
export function buildZamaConfig(
  signer: GenericSigner | undefined,
  provider: GenericProvider,
  params: ZamaConfigBase,
): ZamaConfig {
  const { storage, permitStorage } = resolveStorage(params.storage, params.permitStorage);

  const relayer = new RelayerDispatcher(params.chains, params.relayers);

  return {
    chains: params.chains,
    relayer,
    provider,
    signer,
    storage,
    permitStorage,
    keypairTTL: params.keypairTTL,
    permitTTL: params.permitTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  };
}
