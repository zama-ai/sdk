import { hasFhevmRuntimeConfig, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import { ChainRouter } from "../chains/router";
import {
  DEFAULT_PERMIT_DURATION_DAYS,
  DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS,
} from "../credentials/credential-service";
import {
  PermitTTLSchema,
  TransportKeyPairScopeSchema,
  TransportKeyPairTTLSchema,
} from "../credentials/schemas";
import { LoggerService } from "../services/logger-service";
import type { GenericProvider, GenericSigner } from "../types";
import { parseSchema } from "../validation";
import { DEFAULT_REGISTRY_TTL_SECONDS, RegistryTTLSchema } from "../wrappers-registry";
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
  const logger = new LoggerService(params.logger);
  const consumerLogger = params.logger;

  if (hasFhevmRuntimeConfig()) {
    // One config per signer is a supported pattern, so a second call is only worth warning about
    // when it carries runtime options that the already-locked runtime config will ignore.
    const message = "runtime configuration is already set and cannot be changed.";
    if (params.runtime === undefined) {
      logger.debug(message);
    } else {
      logger.warn(message);
    }
  } else {
    setFhevmRuntimeConfig({
      wasmAssetLoadMode: "auto",
      moduleVersions: "auto",
      logger: {
        error: (message, cause) => consumerLogger?.error(message, { cause }),
        warn: (message) => consumerLogger?.warn(message),
        debug: (message) => consumerLogger?.debug(message),
      },
      ...params.runtime,
    });
  }

  const { storage, permitStorage } = resolveStorage(params.storage, params.permitStorage);

  const router = new ChainRouter(params.chains, params.relayers);

  return {
    chains: params.chains,
    router,
    provider,
    signer,
    storage,
    permitStorage,
    transportKeyPairTTL: parseSchema(
      TransportKeyPairTTLSchema,
      params.transportKeyPairTTL ?? DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS,
    ),
    permitTTL: parseSchema(PermitTTLSchema, params.permitTTL ?? DEFAULT_PERMIT_DURATION_DAYS),
    transportKeyPairScope:
      params.transportKeyPairScope === undefined
        ? undefined
        : parseSchema(TransportKeyPairScopeSchema, params.transportKeyPairScope),
    registryTTL: parseSchema(RegistryTTLSchema, params.registryTTL ?? DEFAULT_REGISTRY_TTL_SECONDS),
    logger,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
