import { hasFhevmRuntimeConfig, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import { ChainRouter } from "../chains/router";
import {
  DEFAULT_PERMIT_DURATION_DAYS,
  DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS,
} from "../credentials/credential-service";
import { DerivationSecretHolder } from "../credentials/keypair-wrapping";
import {
  DerivationSecretSchema,
  PermitTTLSchema,
  TransportKeyPairScopeSchema,
  TransportKeyPairTTLSchema,
} from "../credentials/schemas";
import { ConfigurationError } from "../errors";
import { LoggerService } from "../services/logger-service";
import type { GenericProvider, GenericSigner } from "../types";
import { parseSchema } from "../validation";
import { DEFAULT_REGISTRY_TTL_SECONDS, RegistryTTLSchema } from "../wrappers-registry";
import { setResolvedDerivationSecretHolder } from "./private-state";
import { resolveStorage } from "./resolve";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/**
 * Copies a `Uint8Array` secret so the holder only ever zeroizes the SDK's own buffer, and
 * a caller zeroizing theirs cannot corrupt later wraps. Strings are immutable, so no copy.
 */
function derivationSecretHolder(
  secret: string | Uint8Array | undefined,
): DerivationSecretHolder | undefined {
  if (secret === undefined) {
    return undefined;
  }
  const parsed = parseSchema(DerivationSecretSchema, secret);
  return new DerivationSecretHolder(typeof parsed === "string" ? parsed : new Uint8Array(parsed));
}

/**
 * Omitting the option means cleartext-at-rest by choice; passing it as `undefined` means the
 * caller asked for wrapping and the value went missing, so it must fail instead of downgrading.
 */
function assertDerivationSecretNotUnset(params: ZamaConfigBase): void {
  if (
    !Object.hasOwn(params, "transportKeyPairDerivationSecret") ||
    params.transportKeyPairDerivationSecret !== undefined
  ) {
    return;
  }
  throw new ConfigurationError(
    "transportKeyPairDerivationSecret was passed as undefined, which usually means the environment variable it reads is unset (e.g. process.env.ZAMA_TRANSPORT_KEY_PAIR_SECRET). Supply the secret, or omit the option entirely to persist transport key pairs in cleartext on purpose.",
  );
}

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
  assertDerivationSecretNotUnset(params);

  const logger = new LoggerService(params.logger);

  if (hasFhevmRuntimeConfig()) {
    logger.warn("runtime configuration is already set and cannot be changed.");
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

  const router = new ChainRouter(params.chains, params.relayers);

  const secretHolder = derivationSecretHolder(params.transportKeyPairDerivationSecret);

  const config = {
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

  if (secretHolder !== undefined) {
    setResolvedDerivationSecretHolder(config, secretHolder);
  }

  return config;
}
