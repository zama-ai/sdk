import {
  DEFAULT_KEYPAIR_TTL_SECONDS,
  DEFAULT_PERMIT_DURATION_DAYS,
} from "../credentials/credential-service";
import { KeypairTTLSchema, PermitTTLSchema } from "../credentials/schemas";
import { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericProvider, GenericSigner } from "../types";
import { DEFAULT_REGISTRY_TTL_SECONDS, RegistryTTLSchema } from "../wrappers-registry";
import { parseConfiguration } from "../validation";
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
    router: relayer, // same instance — RelayerDispatcher extends ChainRouter
    provider,
    signer,
    storage,
    permitStorage,
    keypairTTL: parseConfiguration(
      KeypairTTLSchema,
      params.keypairTTL ?? DEFAULT_KEYPAIR_TTL_SECONDS,
    ),
    permitTTL: parseConfiguration(
      PermitTTLSchema,
      params.permitTTL ?? DEFAULT_PERMIT_DURATION_DAYS,
    ),
    registryTTL: parseConfiguration(
      RegistryTTLSchema,
      params.registryTTL ?? DEFAULT_REGISTRY_TTL_SECONDS,
    ),
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
