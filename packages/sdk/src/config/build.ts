import { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericProvider, GenericSigner } from "../types";
import { resolveStorage } from "./resolve";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/**
 * @internal Shared config builder — not part of the public API.
 */
export function buildZamaConfig(
  signer: GenericSigner,
  provider: GenericProvider,
  params: ZamaConfigBase,
): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);

  const relayer = new RelayerDispatcher(params.chains, params.relayers);

  return {
    chains: params.chains,
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
