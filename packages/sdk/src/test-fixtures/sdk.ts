// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import type { ZamaConfig } from "../config/types";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { ChainRouter } from "../relayer/chain-router";
import type { GenericProvider, GenericSigner, GenericStorage } from "../types";
import { ZamaSDK } from "../zama-sdk";
import type { ChainFixtures } from "./chain";
import type { ProviderFixtures } from "./provider";
import type { RelayerFixtures } from "./relayer";
import type { SignerFixtures } from "./signer";
import type { StorageFixtures } from "./storage";
import type { FixturesOf } from "./types";

export type CreateSDKFn = (overrides?: Partial<ZamaConfig>) => ZamaSDK;

export interface SdkFixtures {
  sdk: ZamaSDK;
  createSDK: CreateSDKFn;
  events: typeof ZamaSDKEvents;
}

function buildSDK(
  router: ChainRouter,
  provider: GenericProvider,
  signer: GenericSigner,
  storage: GenericStorage,
  overrides?: Partial<ZamaConfig>,
): ZamaSDK {
  return new ZamaSDK({
    router,
    provider,
    signer,
    storage,
    permitStorage: storage,
    keypairTTL: 2592000,
    permitTTL: 1,
    registryTTL: 86400,
    onEvent: undefined,
    ...overrides,
  } as unknown as ZamaConfig);
}

type SdkDeps = ChainFixtures &
  RelayerFixtures &
  ProviderFixtures &
  SignerFixtures &
  StorageFixtures;

export const sdkFixtures: FixturesOf<SdkFixtures, SdkDeps> = {
  sdk: async ({ router, provider, signer, storage }, use) => {
    await use(buildSDK(router, provider, signer, storage));
  },
  createSDK: async ({ provider, signer, router, storage }, use) => {
    const factory: CreateSDKFn = (overrides) =>
      buildSDK(router, provider, signer, storage, overrides);
    await use(factory);
  },
  events: ZamaSDKEvents,
};
