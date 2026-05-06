import { z } from "zod";
import type { FheChain } from "../chains";
import { FheChainSchema } from "../chains/schema";
import {
  DEFAULT_KEYPAIR_TTL_SECONDS,
  DEFAULT_PERMIT_DURATION_DAYS,
} from "../credentials/credential-service";
import { KeypairTTLSchema, PermitTTLSchema } from "../credentials/schemas";
import { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import type { GenericProvider, GenericSigner } from "../types";
import {
  DEFAULT_REGISTRY_TTL_SECONDS,
  RegistryAddressesSchema,
  RegistryTTLSchema,
} from "../wrappers-registry";
import { parseConfiguration } from "../validation";
import { resolveStorage } from "./resolve";
import type { ZamaConfig, ZamaConfigBase, ZamaSDKConfig } from "./types";

const ResolvedZamaConfigInvariantsSchema = z
  .object({
    chains: z.array(FheChainSchema),
    keypairTTL: KeypairTTLSchema,
    permitTTL: PermitTTLSchema,
    registryTTL: RegistryTTLSchema,
    registryAddresses: RegistryAddressesSchema,
  })
  .loose();

const InputChainsSchema = z.array(FheChainSchema).nonempty();

function registryAddressesFromChains(
  chains: readonly FheChain[],
): z.infer<typeof RegistryAddressesSchema> {
  const registryAddresses: Record<number, string> = {};
  for (const chain of chains) {
    if (chain.registryAddress) {
      registryAddresses[chain.id] = chain.registryAddress;
    }
  }
  return parseConfiguration(RegistryAddressesSchema, registryAddresses);
}

export function normalizeZamaSDKConfig(config: ZamaSDKConfig): ZamaConfig {
  const chains = parseConfiguration(z.array(FheChainSchema), config.chains ?? []);
  const { storage, permitStorage } = resolveStorage(config.storage, config.permitStorage);
  const resolved = {
    chains,
    relayer: config.relayer,
    provider: config.provider,
    signer: config.signer,
    storage,
    permitStorage,
    keypairTTL: parseConfiguration(
      KeypairTTLSchema,
      config.keypairTTL ?? DEFAULT_KEYPAIR_TTL_SECONDS,
    ),
    permitTTL: parseConfiguration(
      PermitTTLSchema,
      config.permitTTL ?? DEFAULT_PERMIT_DURATION_DAYS,
    ),
    registryTTL: parseConfiguration(
      RegistryTTLSchema,
      config.registryTTL ?? DEFAULT_REGISTRY_TTL_SECONDS,
    ),
    registryAddresses: registryAddressesFromChains(chains),
    onEvent: config.onEvent,
  };
  parseConfiguration(ResolvedZamaConfigInvariantsSchema, resolved);
  return resolved;
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
  parseConfiguration(InputChainsSchema, params.chains);
  const { storage, permitStorage } = resolveStorage(params.storage, params.permitStorage);
  const relayer = new RelayerDispatcher(params.chains, params.relayers);

  const resolved = {
    chains: params.chains,
    relayer,
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
    registryAddresses: registryAddressesFromChains(params.chains),
    onEvent: params.onEvent,
  };
  parseConfiguration(ResolvedZamaConfigInvariantsSchema, resolved);
  return resolved;
}
