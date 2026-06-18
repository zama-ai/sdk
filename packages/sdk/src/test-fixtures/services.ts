// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { Address } from "viem";
import type { CredentialServiceConfig } from "../credentials/credential-service";
import { CredentialService } from "../credentials/credential-service";
import type { ZamaSDKEventInput } from "../events/sdk-events";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import { CachingService } from "../services/caching-service";
import { DecryptionService } from "../services/decryption-service";
import { DelegationService } from "../services/delegation-service";
import { EncryptionService } from "../services/encryption-service";
import { LifecycleService } from "../services/lifecycle-service";
import type { GenericProvider, GenericSigner } from "../types";
import type { ProviderFixtures } from "./provider";
import type { RelayerFixtures } from "./relayer";
import type { SignerFixtures } from "./signer";
import type { StorageFixtures } from "./storage";
import type { FixturesOf } from "./types";

export type CreateCredentialServiceFn = (
  config?: Partial<CredentialServiceConfig>,
) => CredentialService;

export type CreateDelegationServiceFn = (overrides?: {
  provider?: GenericProvider;
  relayer?: RelayerDispatcher;
  emitEvent?: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
}) => DelegationService;

export type CreateDecryptionServiceFn = (overrides?: {
  cache?: CachingService;
  credentialService?: CredentialService;
  delegationService?: DelegationService;
  relayer?: RelayerDispatcher;
  emitEvent?: (input: ZamaSDKEventInput) => void;
}) => DecryptionService;

export type CreateEncryptionServiceFn = (overrides?: {
  relayer?: RelayerDispatcher;
  emitEvent?: (input: ZamaSDKEventInput, tokenAddress?: Address) => void;
}) => EncryptionService;

export type CreateLifecycleServiceFn = (overrides?: {
  signer?: GenericSigner;
  cachingService?: CachingService;
  relayer?: RelayerDispatcher;
  credentialService?: CredentialService;
}) => LifecycleService;

export interface ServiceFixtures {
  cachingService: CachingService;
  credentialService: CredentialService;
  delegationService: DelegationService;
  decryptionService: DecryptionService;
  encryptionService: EncryptionService;
  createCredentialService: CreateCredentialServiceFn;
  createDelegationService: CreateDelegationServiceFn;
  createDecryptionService: CreateDecryptionServiceFn;
  createEncryptionService: CreateEncryptionServiceFn;
  createLifecycleService: CreateLifecycleServiceFn;
}

type ServiceDeps = RelayerFixtures & SignerFixtures & ProviderFixtures & StorageFixtures;

export const serviceFixtures: FixturesOf<ServiceFixtures, ServiceDeps> = {
  cachingService: async ({ storage }, use) => {
    await use(new CachingService(storage));
  },
  createCredentialService: async ({ relayer, signer, storage }, use) => {
    const factory: CreateCredentialServiceFn = (config = {}) =>
      new CredentialService({
        relayer: (config.relayer ?? relayer) as CredentialServiceConfig["relayer"],
        signer: config.signer ?? signer,
        transportKeyPairTTL: config.transportKeyPairTTL ?? 86400,
        permitTTL: config.permitTTL ?? 1,
        storage: config.storage ?? storage,
        permitStorage: config.permitStorage,
      });
    await use(factory);
  },
  credentialService: async ({ createCredentialService }, use) => {
    await use(createCredentialService({}));
  },
  createDelegationService: async ({ provider, relayer }, use) => {
    const factory: CreateDelegationServiceFn = (overrides = {}) =>
      new DelegationService({
        provider: overrides.provider ?? provider,
        relayer: (overrides.relayer ?? relayer) as unknown as RelayerDispatcher,
        emitEvent: overrides.emitEvent,
      });
    await use(factory);
  },
  delegationService: async ({ createDelegationService }, use) => {
    await use(createDelegationService());
  },
  createDecryptionService: async (
    { cachingService, credentialService, delegationService, relayer },
    use,
  ) => {
    const factory: CreateDecryptionServiceFn = (overrides = {}) =>
      new DecryptionService({
        cache: overrides.cache ?? cachingService,
        credentialService: overrides.credentialService ?? credentialService,
        delegationService: overrides.delegationService ?? delegationService,
        relayer: (overrides.relayer ?? relayer) as unknown as RelayerDispatcher,
        emitEvent: overrides.emitEvent ?? vi.fn(),
      });
    await use(factory);
  },
  decryptionService: async ({ createDecryptionService }, use) => {
    await use(createDecryptionService());
  },
  createEncryptionService: async ({ relayer }, use) => {
    const factory: CreateEncryptionServiceFn = (overrides = {}) =>
      new EncryptionService({
        relayer: (overrides.relayer ?? relayer) as unknown as RelayerDispatcher,
        emitEvent: overrides.emitEvent ?? vi.fn(),
      });
    await use(factory);
  },
  encryptionService: async ({ createEncryptionService }, use) => {
    await use(createEncryptionService());
  },
  createLifecycleService: async ({ signer, cachingService, relayer }, use) => {
    const factory: CreateLifecycleServiceFn = (overrides = {}) =>
      new LifecycleService({
        signer: "signer" in overrides ? overrides.signer : signer,
        cachingService: overrides.cachingService ?? cachingService,
        relayer: (overrides.relayer ?? relayer) as unknown as RelayerDispatcher,
        credentialService: overrides.credentialService,
      });
    await use(factory);
  },
};
