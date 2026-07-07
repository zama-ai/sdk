// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import type { FheChain } from "../chains/types";
import type { ZamaConfig } from "../config/types";
import { ZamaSDKEvents } from "../events/sdk-events";
import type { FhevmRelayerSDK } from "../relayer/types";
import type { GenericProvider, GenericSigner, GenericStorage } from "../types";
import { LoggerService } from "../services/logger-service";
import { ZamaSDK } from "../zama-sdk";
import type { ChainFixtures } from "./chain";
import type { ProviderFixtures } from "./provider";
import type { RelayerFixtures } from "./relayer";
import type { SignerFixtures } from "./signer";
import type { StorageFixtures } from "./storage";
import type { FixturesOf } from "./types";

/** Overrides accepted by createSDK. Extends ZamaConfig with a test-only `relayer` shorthand. */
export type CreateSDKOverrides = Partial<ZamaConfig> & { relayer?: FhevmRelayerSDK };
export type CreateSDKFn = (overrides?: CreateSDKOverrides) => ZamaSDK;

export interface SdkFixtures {
  sdk: ZamaSDK;
  createSDK: CreateSDKFn;
  events: typeof ZamaSDKEvents;
}

function buildSDK(
  chain: FheChain,
  defaultRelayer: FhevmRelayerSDK,
  provider: GenericProvider,
  signer: GenericSigner,
  storage: GenericStorage,
  overrides?: CreateSDKOverrides,
): ZamaSDK {
  // Allow tests to inject a custom relayer via the `relayer` shorthand.
  const { relayer: relayerOverride, ...restOverrides } = overrides ?? {};
  const relayer = relayerOverride ?? defaultRelayer;
  return new ZamaSDK({
    chains: [chain],
    router: { relayer },
    provider,
    signer,
    storage,
    permitStorage: storage,
    transportKeyPairTTL: 2592000,
    permitTTL: 1,
    registryTTL: 86400,
    onEvent: undefined,
    // Resolved configs always carry a LoggerService (buildZamaConfig guarantees
    // it); the silent default mirrors a consumer who configured no logger.
    logger: new LoggerService(),
    ...restOverrides,
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
