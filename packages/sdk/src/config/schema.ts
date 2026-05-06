import { z } from "zod";
import { FheChainSchema, RegistryAddressesSchema, RegistryTTLSchema } from "../chains/schema";
import {
  DEFAULT_KEYPAIR_TTL_SECONDS,
  DEFAULT_PERMIT_DURATION_DAYS,
} from "../credentials/credential-service";
import { KeypairTTLSchema, PermitTTLSchema } from "../credentials/schemas";
import type { ZamaSDKConfig } from "../zama-sdk";
import type { ZamaConfigBase } from "./types";

const SharedTTLFields = {
  keypairTTL: KeypairTTLSchema.default(DEFAULT_KEYPAIR_TTL_SECONDS),
  permitTTL: PermitTTLSchema.default(DEFAULT_PERMIT_DURATION_DAYS),
  registryTTL: RegistryTTLSchema.optional(),
};

const PublicConfigDataSchema = z.object({
  chains: z.tuple([FheChainSchema], FheChainSchema),
  ...SharedTTLFields,
});

const SDKConfigDataSchema = z.object({
  chains: z.array(FheChainSchema).optional(),
  ...SharedTTLFields,
  registryAddresses: RegistryAddressesSchema.optional(),
});

type PublicConfigData = z.output<typeof PublicConfigDataSchema>;
type SDKConfigData = z.output<typeof SDKConfigDataSchema>;

type ParsedZamaConfigBase<T extends ZamaConfigBase> = Omit<T, keyof PublicConfigData> &
  PublicConfigData;

type ParsedZamaSDKConfig = Omit<ZamaSDKConfig, keyof SDKConfigData> & SDKConfigData;

export function parseZamaConfigBase<T extends ZamaConfigBase>(params: T): ParsedZamaConfigBase<T> {
  const parsed = PublicConfigDataSchema.parse(params);
  return { ...params, ...parsed } as ParsedZamaConfigBase<T>;
}

export function parseZamaSDKConfig(config: ZamaSDKConfig): ParsedZamaSDKConfig {
  const parsed = SDKConfigDataSchema.parse(config);
  return { ...config, ...parsed } as ParsedZamaSDKConfig;
}
