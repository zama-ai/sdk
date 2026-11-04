import { hasFhevmRuntimeConfig, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import type { AtLeastOneChain } from "../chains";
import { assertCanonicalChain } from "../chains/configs";
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
import { parseTelemetryMode, type TelemetryState } from "../telemetry";
import type { GenericProvider, GenericSigner } from "../types";
import { parseSchema } from "../validation";
import { DEFAULT_REGISTRY_TTL_SECONDS, RegistryTTLSchema } from "../wrappers-registry";
import { recordAppliedRuntimeConfig } from "../relayer/applied-runtime";
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

  const runtime = {
    wasmAssetLoadMode: "auto" as const,
    moduleVersions: "auto" as const,
    logger: {
      error: (message: string, cause?: unknown) => consumerLogger?.error(message, { cause }),
      warn: (message: string) => consumerLogger?.warn(message),
      debug: (message: string) => consumerLogger?.debug(message),
    },
    ...params.runtime,
  };

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
    setFhevmRuntimeConfig(runtime);
    recordAppliedRuntimeConfig(runtime);
  }

  const { storage, permitStorage } = resolveStorage(params.storage, params.permitStorage);

  const mode = parseTelemetryMode(params.telemetry) ?? "header";
  const telemetry: TelemetryState | undefined =
    mode === "off" ? undefined : { layer: "core", mode };

  // The SDK works from its own frozen copy of each chain, taken after the
  // canonical check, so a later write to the caller's object (or to a preset)
  // cannot change the addresses the SDK reads.
  const allowNonCanonical = params.allowNonCanonicalAddresses === true;
  const chains = params.chains.map((chain) => {
    assertCanonicalChain(chain, allowNonCanonical);
    return Object.freeze({
      ...chain,
      ...(chain.auth && { auth: Object.freeze({ ...chain.auth }) }),
    });
  }) as unknown as AtLeastOneChain;
  const router = new ChainRouter(chains, params.relayers, logger, telemetry);

  return {
    chains: Object.freeze(chains),
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
    clearCredentialsOnWalletChange: params.clearCredentialsOnWalletChange ?? true,
    transportKeyPairScope:
      params.transportKeyPairScope === undefined
        ? undefined
        : parseSchema(TransportKeyPairScopeSchema, params.transportKeyPairScope),
    registryTTL: parseSchema(RegistryTTLSchema, params.registryTTL ?? DEFAULT_REGISTRY_TTL_SECONDS),
    logger,
    onEvent: params.onEvent,
    telemetry,
  } as unknown as ZamaConfig;
}
