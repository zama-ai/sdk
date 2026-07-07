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
import { createMockRouter } from "./router";
import type { SignerFixtures } from "./signer";
import type { StorageFixtures } from "./storage";
import type { FixturesOf } from "./types";

/**
 * Overrides accepted by createSDK — a partial {@link ZamaConfig}. To swap the
 * relayer backend, pass a `router` built with {@link createMockRouter}
 * (e.g. `createSDK({ router: createMockRouter({ relayer }) })`).
 */
export type CreateSDKOverrides = Partial<ZamaConfig>;
export type CreateSDKFn = (overrides?: CreateSDKOverrides) => ZamaSDK;

export interface SdkFixtures {
  sdk: ZamaSDK;
  createSDK: CreateSDKFn;
  events: typeof ZamaSDKEvents;
}

function buildSDK(
  chain: FheChain,
  relayer: FhevmRelayerSDK,
  provider: GenericProvider,
  signer: GenericSigner,
  storage: GenericStorage,
  overrides?: CreateSDKOverrides,
): ZamaSDK {
  // A real ChainRouter (via createMockRouter) so the fixture matches the
  // ZamaConfig shape; tests override the backend by passing their own `router`.
  const { router: routerOverride, ...restOverrides } = overrides ?? {};
  const router = routerOverride ?? createMockRouter({ relayer, chains: [chain] });
  return new ZamaSDK({
    chains: [chain],
    router,
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
