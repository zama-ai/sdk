// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import type { FheChain } from "../chains/types";
import type { ZamaConfig } from "../config/types";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { RelayerSDK } from "../relayer/relayer-sdk";
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
  chain: FheChain,
  relayer: RelayerSDK,
  provider: GenericProvider,
  signer: GenericSigner,
  storage: GenericStorage,
  overrides?: Partial<ZamaConfig>,
): ZamaSDK {
  return new ZamaSDK({
    chains: [chain],
    relayer: relayer as unknown as ZamaConfig["relayer"],
    provider,
    signer,
    storage,
    permitStorage: storage,
    transportKeyPairTTL: 2592000,
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
  sdk: async ({ chain, relayer, provider, signer, storage }, use) => {
    await use(buildSDK(chain, relayer, provider, signer, storage));
  },
  createSDK: async ({ chain, provider, signer, relayer, storage }, use) => {
    const factory: CreateSDKFn = (overrides) =>
      buildSDK(chain, relayer, provider, signer, storage, overrides);
    await use(factory);
  },
  events: ZamaSDKEvents,
};
