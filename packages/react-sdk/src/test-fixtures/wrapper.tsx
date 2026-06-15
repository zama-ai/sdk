// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import type { QueryClient } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type React from "react";
import type { ZamaConfig } from "@zama-fhe/sdk";
import type { ChainRouter } from "@zama-fhe/sdk/relayer/chain-router";
import type { RelayerSDK } from "@zama-fhe/sdk/relayer/relayer-sdk";
import type { FixturesOf } from "@zama-fhe/sdk/test-fixtures/types";
import type { GenericProvider, GenericSigner, GenericStorage } from "@zama-fhe/sdk/types";
import type { QueryClientFixtures } from "./query-client";
import { Providers } from "./providers";

export interface WrapperFixtures {
  createWrapper: (overrides?: Partial<ZamaConfig>) => {
    Wrapper: React.FC<{ children?: React.ReactNode }>;
    queryClient: QueryClient;
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    router: ChainRouter;
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
  relayer: RelayerSDK;
  router: ChainRouter;
  provider: GenericProvider;
  signer: GenericSigner;
  storage: GenericStorage;
};

export const wrapperFixtures: FixturesOf<WrapperFixtures, WrapperDeps> = {
  createWrapper: async ({ router, provider, signer, storage, queryClient }, use) => {
    function createWrapper(overrides?: Partial<ZamaConfig>) {
      const config = {
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
        router: config.router,
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
