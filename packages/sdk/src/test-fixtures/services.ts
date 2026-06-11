// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import type { CredentialServiceConfig } from "../credentials/credential-service";
import { CredentialService } from "../credentials/credential-service";
import type { RelayerDispatcher } from "../relayer/relayer-dispatcher";
import { CachingService } from "../services/caching-service";
import { DecryptionService } from "../services/decryption-service";
import { DelegationService } from "../services/delegation-service";
import { EncryptionService } from "../services/encryption-service";
import { EventService } from "../services/event-service";
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
  events?: EventService;
}) => DelegationService;

export type CreateDecryptionServiceFn = (overrides?: {
  cache?: CachingService;
  credentialService?: CredentialService;
  delegationService?: DelegationService;
  relayer?: RelayerDispatcher;
  events?: EventService;
}) => DecryptionService;

export type CreateEncryptionServiceFn = (overrides?: {
  relayer?: RelayerDispatcher;
  events?: EventService;
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
  eventService: EventService;
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
  eventService: async ({}, use) => {
    await use(new EventService());
  },
  createCredentialService: async ({ relayer, signer, storage }, use) => {
    const factory: CreateCredentialServiceFn = (config = {}) =>
      new CredentialService({
        relayer: (config.relayer ?? relayer) as CredentialServiceConfig["relayer"],
        signer: config.signer ?? signer,
        keypairTTL: config.keypairTTL ?? 86400,
        permitTTL: config.permitTTL ?? 1,
        storage: config.storage ?? storage,
        permitStorage: config.permitStorage,
      });
    await use(factory);
  },
  credentialService: async ({ createCredentialService }, use) => {
    await use(createCredentialService({}));
  },
  createDelegationService: async ({ provider, relayer, eventService }, use) => {
    const factory: CreateDelegationServiceFn = (overrides = {}) =>
      new DelegationService({
        provider: overrides.provider ?? provider,
        relayer: (overrides.relayer ?? relayer) as unknown as RelayerDispatcher,
        events: overrides.events ?? eventService,
      });
    await use(factory);
  },
  delegationService: async ({ createDelegationService }, use) => {
    await use(createDelegationService());
  },
  createDecryptionService: async (
    { cachingService, credentialService, delegationService, relayer, eventService },
    use,
  ) => {
    const factory: CreateDecryptionServiceFn = (overrides = {}) =>
      new DecryptionService({
        cache: overrides.cache ?? cachingService,
        credentialService: overrides.credentialService ?? credentialService,
        delegationService: overrides.delegationService ?? delegationService,
        relayer: (overrides.relayer ?? relayer) as unknown as RelayerDispatcher,
        events: overrides.events ?? eventService,
      });
    await use(factory);
  },
  decryptionService: async ({ createDecryptionService }, use) => {
    await use(createDecryptionService());
  },
  createEncryptionService: async ({ relayer, eventService }, use) => {
    const factory: CreateEncryptionServiceFn = (overrides = {}) =>
      new EncryptionService({
        relayer: (overrides.relayer ?? relayer) as unknown as RelayerDispatcher,
        events: overrides.events ?? eventService,
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
