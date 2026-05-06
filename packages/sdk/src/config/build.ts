import { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericProvider, GenericSigner } from "../types";
import { resolveStorage } from "./resolve";
import { parseZamaConfigBase } from "./schema";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/**
 * @internal Shared config builder — not part of the public API.
 */
export function buildZamaConfig(
  signer: GenericSigner | undefined,
  provider: GenericProvider,
  params: ZamaConfigBase,
): ZamaConfig {
  const config = parseZamaConfigBase(params);
  const { storage, permitStorage } = resolveStorage(config.storage, config.permitStorage);

  const relayer = new RelayerDispatcher(config.chains, config.relayers);

  return {
    chains: config.chains,
    relayer,
    provider,
    signer,
    storage,
    permitStorage,
    keypairTTL: config.keypairTTL,
    permitTTL: config.permitTTL,
    registryTTL: config.registryTTL,
    onEvent: config.onEvent,
  };
}
