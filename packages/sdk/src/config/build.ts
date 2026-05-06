import { RegistryTTLSchema } from "../chains/schema";
import {
  DEFAULT_KEYPAIR_TTL_SECONDS,
  DEFAULT_PERMIT_DURATION_DAYS,
} from "../credentials/credential-service";
import { KeypairTTLSchema, PermitTTLSchema } from "../credentials/schemas";
import { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericProvider, GenericSigner } from "../types";
import { DEFAULT_REGISTRY_TTL_SECONDS } from "../wrappers-registry";
import { resolveStorage } from "./resolve";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/**
 * @internal Shared config builder — not part of the public API.
 *
 * Applies defaults, validates TTLs, and resolves storage so the
 * returned config is fully populated and ready for `ZamaSDK`.
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
    keypairTTL: KeypairTTLSchema.parse(params.keypairTTL ?? DEFAULT_KEYPAIR_TTL_SECONDS),
    permitTTL: PermitTTLSchema.parse(params.permitTTL ?? DEFAULT_PERMIT_DURATION_DAYS),
    registryTTL: RegistryTTLSchema.parse(params.registryTTL ?? DEFAULT_REGISTRY_TTL_SECONDS),
    onEvent: params.onEvent,
  };
}
