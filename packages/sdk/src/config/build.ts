import type { GenericSigner } from "../types";
import type { ZamaConfig, ZamaConfigBase } from "./types";
import { resolveStorage, resolveChainTransports, buildRelayer } from "./resolve";

/**
 * @internal Shared config builder — not part of the public API.
 *
 * Each entry point (`/viem`, `/ethers`, wagmi) creates its signer,
 * then delegates here for the common resolution work.
 */
export function buildZamaConfig(signer: GenericSigner, params: ZamaConfigBase): ZamaConfig {
  const { storage, sessionStorage } = resolveStorage(params.storage, params.sessionStorage);
  const chainTransports = resolveChainTransports(
    params.chains,
    params.transports,
    params.chains.map((c) => c.id),
  );
  const relayer = buildRelayer(chainTransports, () => signer.getChainId());

  return {
    chains: params.chains,
    relayer,
    signer,
    storage,
    sessionStorage,
    keypairTTL: params.keypairTTL,
    sessionTTL: params.sessionTTL,
    registryTTL: params.registryTTL,
    onEvent: params.onEvent,
  };
}
