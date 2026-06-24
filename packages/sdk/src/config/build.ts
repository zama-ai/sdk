import {
  DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS,
  DEFAULT_PERMIT_DURATION_DAYS,
} from "../credentials/credential-service";
import { TransportKeyPairTTLSchema, PermitTTLSchema } from "../credentials/schemas";
import { RelayerRouter } from "../relayer/relayer-router";
import { LoggerService } from "../services/logger-service";
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
  const logger = new LoggerService(params.logger);
  const router = new RelayerRouter(params.chains, params.relayers);

  return {
    chains: params.chains,
    router,
    provider,
    signer,
    storage,
    permitStorage,
    transportKeyPairTTL: parseConfiguration(
      TransportKeyPairTTLSchema,
      params.transportKeyPairTTL ?? DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS,
    ),
    permitTTL: parseConfiguration(
      PermitTTLSchema,
      params.permitTTL ?? DEFAULT_PERMIT_DURATION_DAYS,
    ),
    registryTTL: parseConfiguration(
      RegistryTTLSchema,
      params.registryTTL ?? DEFAULT_REGISTRY_TTL_SECONDS,
    ),
    logger,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
