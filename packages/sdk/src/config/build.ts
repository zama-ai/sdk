import {
  DEFAULT_TRANSPORT_KEY_PAIR_TTL_SECONDS,
  DEFAULT_PERMIT_DURATION_DAYS,
} from "../credentials/credential-service";
import { TransportKeyPairTTLSchema, PermitTTLSchema } from "../credentials/schemas";
import { LoggerService } from "../services/logger-service";
import { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericProvider, GenericSigner } from "../types";
import { DEFAULT_REGISTRY_TTL_SECONDS, RegistryTTLSchema } from "../wrappers-registry";
import { parseConfiguration } from "../validation";
import { resolveStorage } from "./resolve";
import type { ZamaConfig, ZamaConfigBase } from "./types";

/**
 * Config keys renamed by the credentials refactor (SDK-134) and the keypair
 * glossary alignment (SDK-204). `ZamaConfigBase` has no index signature, so a
 * removed key survives on a config assembled via a variable or spread (the
 * excess-property check only fires on a direct object literal) and would
 * otherwise be dropped with no signal — see {@link warnRenamedConfigKeys}.
 */
const RENAMED_CONFIG_KEYS: Record<string, string> = {
  sessionStorage: "permitStorage",
  sessionTTL: "permitTTL",
  keypairTTL: "transportKeyPairTTL",
};

function warnRenamedConfigKeys(params: ZamaConfigBase, logger: LoggerService): void {
  for (const [oldKey, newKey] of Object.entries(RENAMED_CONFIG_KEYS)) {
    if (oldKey in params) {
      logger.warn(
        `Config key '${oldKey}' was renamed to '${newKey}' and is no longer read by createConfig — remove '${oldKey}' and pass '${newKey}' instead.`,
      );
    }
  }
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
  const { storage, permitStorage } = resolveStorage(params.storage, params.permitStorage);
  const logger = new LoggerService(params.logger);
  warnRenamedConfigKeys(params, logger);
  const relayer = new RelayerDispatcher(params.chains, params.relayers, logger);

  return {
    chains: params.chains,
    relayer,
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
