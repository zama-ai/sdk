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
import { ConfigurationError } from "../errors";
import { LoggerService } from "../services/logger-service";
import type { GenericProvider, GenericSigner } from "../types";
import { parseConfiguration } from "../validation";
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
  // The FHEVM runtime is a process-global, set-once singleton. The first
  // config applies it; later configs are allowed as long as they don't try to
  // change the runtime — passing explicit `runtime` options after it's set is
  // rejected, but omitting them is an idempotent no-op.
  if (hasFhevmRuntimeConfig()) {
    if (params.runtime !== undefined) {
      throw new ConfigurationError(
        "FHEVM runtime configuration is already set and cannot be changed.",
      );
    }
  } else {
    setFhevmRuntimeConfig({
      wasmAssetLoadMode: "auto",
      moduleVersions: "auto",
      logger: {
        error: (message, cause) => params.logger?.error(message, { cause }),
        warn: (message) => params.logger?.warn(message),
        debug: (message) => params.logger?.debug(message),
      },
      ...params.runtime,
    });
  }

  const { storage, permitStorage } = resolveStorage(params.storage, params.permitStorage);
  const logger = new LoggerService(params.logger);
  const router = new ChainRouter(params.chains, params.relayers);

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
    transportKeyPairScope:
      params.transportKeyPairScope === undefined
        ? undefined
        : parseConfiguration(TransportKeyPairScopeSchema, params.transportKeyPairScope),
    registryTTL: parseConfiguration(
      RegistryTTLSchema,
      params.registryTTL ?? DEFAULT_REGISTRY_TTL_SECONDS,
    ),
    logger,
    onEvent: params.onEvent,
  } as unknown as ZamaConfig;
}
