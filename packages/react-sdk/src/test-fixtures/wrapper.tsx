// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import type { QueryClient } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type { GenericLogger, ZamaConfig } from "@zama-fhe/sdk";
import type { FheChain } from "@zama-fhe/sdk/chains";
import type { RelayerSDK } from "@zama-fhe/sdk/relayer/types";
import type { FixturesOf } from "@zama-fhe/sdk/test-fixtures/types";
import type { GenericProvider, GenericSigner, GenericStorage } from "@zama-fhe/sdk/types";
import type React from "react";
import { Providers } from "./providers";
import type { QueryClientFixtures } from "./query-client";

/** Silent logger standing in for the SDK's resolved no-op `LoggerService`. */
const noopLogger: GenericLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {},
};

export interface WrapperFixtures {
  createWrapper: (overrides?: Partial<ZamaConfig>) => {
    Wrapper: React.FC<{ children?: React.ReactNode }>;
    queryClient: QueryClient;
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    relayer: RelayerSDK;
    storage: GenericStorage;
  };
  renderWithProviders: <TResult>(
    hook: () => TResult,
    overrides?: Partial<ZamaConfig>,
    options?: Omit<RenderHookOptions<unknown>, "wrapper">,
  ) => ReturnType<typeof renderHook<TResult, unknown>> & {
    queryClient: QueryClient;
  };
}

type WrapperDeps = QueryClientFixtures & {
  chain: FheChain;
  relayer: RelayerSDK;
  provider: GenericProvider;
  signer: GenericSigner;
  storage: GenericStorage;
};

export const wrapperFixtures: FixturesOf<WrapperFixtures, WrapperDeps> = {
  createWrapper: async ({ chain, relayer, provider, signer, storage, queryClient }, use) => {
    function createWrapper(overrides?: Partial<ZamaConfig>) {
      const config = {
        chains: [chain],
        router: { relayer, switchChain: () => {} } as unknown as ZamaConfig["router"],
        provider,
        signer,
        storage,
        permitStorage: storage,
        transportKeyPairTTL: 2592000,
        permitTTL: 1,
        registryTTL: 86400,
        onEvent: undefined,
        logger: noopLogger,
        ...overrides,
      } as unknown as ZamaConfig;

      function Wrapper({ children }: { children?: React.ReactNode }) {
        return (
          <Providers queryClient={queryClient} config={config}>
            {children}
          </Providers>
        );
      }

      return {
        Wrapper,
        queryClient,
        signer: config.signer,
        provider: config.provider,
        relayer: config.router.relayer,
        storage: config.storage,
      };
    }
    await use(createWrapper);
  },
  renderWithProviders: async ({ createWrapper }, use) => {
    function renderWithProviders<TResult>(
      hook: () => TResult,
      overrides?: Partial<ZamaConfig>,
      options?: Omit<RenderHookOptions<unknown>, "wrapper">,
    ) {
      const { Wrapper, queryClient } = createWrapper(overrides);
      return {
        ...renderHook(hook, { wrapper: Wrapper, ...options }),
        queryClient,
      };
    }
    await use(renderWithProviders);
  },
};
