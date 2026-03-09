/* eslint-disable no-empty-pattern */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type {
  GenericSigner,
  GenericStorage,
  RelayerSDK,
  Token,
  ZamaSDKEventListener,
} from "@zama-fhe/sdk";
import { fhevmHardhat, type FhevmChain } from "@zama-fhe/sdk/chains";
import React, { type PropsWithChildren } from "react";
import { vi } from "vitest";
import { test as base } from "../../sdk/src/test-fixtures";
import { createMockToken } from "./__tests__/mutation-test-helpers";
import {
  createFhevmConfig,
  type FhevmAdvancedOptions,
  type FhevmConfig,
  type RelayerOverride,
  type WalletOption,
} from "./config";
import { ZamaProvider, type ZamaProviderProps } from "./provider";
import * as resolveRelayerModule from "./resolve-relayer";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";

interface WrapperOverrides {
  config?: FhevmConfig;
  chain?: FhevmChain;
  wallet?: WalletOption;
  signer?: GenericSigner;
  relayer?: RelayerSDK;
  storage?: GenericStorage;
  relayerOverride?: RelayerOverride;
  advanced?: FhevmAdvancedOptions;
  keypairTTL?: number;
  sessionTTL?: number;
  onEvent?: ZamaSDKEventListener;
}

function Providers({
  children,
  queryClient,
  config,
}: PropsWithChildren<ZamaProviderProps & { queryClient: QueryClient }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider config={config}>{children}</ZamaProvider>
    </QueryClientProvider>
  );
}

interface ReactSdkFixtures {
  token: Token;
  queryClient: QueryClient;
  createWrapper: (overrides?: WrapperOverrides) => {
    Wrapper: React.FC<{ children?: React.ReactNode }>;
    queryClient: QueryClient;
    signer: GenericSigner | undefined;
    relayer: RelayerSDK;
    storage: GenericStorage;
  };
  renderWithProviders: <TResult>(
    hook: () => TResult,
    overrides?: WrapperOverrides,
    options?: Omit<RenderHookOptions<unknown>, "wrapper">,
  ) => ReturnType<typeof renderHook<TResult, unknown>> & { queryClient: QueryClient };
}

export const test = base.extend<ReactSdkFixtures>({
  token: async ({}, use) => {
    await use(createMockToken());
  },
  queryClient: async ({}, use) => {
    await use(
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    );
  },
  createWrapper: async ({ relayer, signer, storage, queryClient }, use) => {
    let currentRelayer = relayer;
    const relayerSpy = vi
      .spyOn(resolveRelayerModule, "resolveRelayer")
      .mockImplementation(() => currentRelayer);

    function createWrapper(overrides?: WrapperOverrides) {
      const advanced: FhevmAdvancedOptions | undefined =
        overrides?.advanced ||
        overrides?.keypairTTL !== undefined ||
        overrides?.sessionTTL !== undefined ||
        overrides?.onEvent
          ? {
              ...overrides?.advanced,
              keypairTTL: overrides?.keypairTTL ?? overrides?.advanced?.keypairTTL,
              sessionTTL: overrides?.sessionTTL ?? overrides?.advanced?.sessionTTL,
              onEvent: overrides?.onEvent ?? overrides?.advanced?.onEvent,
            }
          : undefined;

      const config =
        overrides?.config ??
        createFhevmConfig({
          chain: overrides?.chain ?? fhevmHardhat,
          wallet: overrides?.wallet ?? overrides?.signer ?? signer,
          storage: overrides?.storage ?? storage,
          relayer: overrides?.relayerOverride,
          advanced,
        });

      currentRelayer = overrides?.relayer ?? relayer;
      const resolvedSigner =
        overrides?.wallet && typeof overrides.wallet === "object" && "type" in overrides.wallet
          ? undefined
          : ((overrides?.wallet as GenericSigner | undefined) ?? overrides?.signer ?? signer);

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
        signer: resolvedSigner,
        relayer: currentRelayer,
        storage: config.storage,
      };
    }

    await use(createWrapper);
    relayerSpy.mockRestore();
  },
  renderWithProviders: async ({ createWrapper }, use) => {
    function renderWithProviders<TResult>(
      hook: () => TResult,
      overrides?: WrapperOverrides,
      options?: Omit<RenderHookOptions<unknown>, "wrapper">,
    ) {
      const { Wrapper, queryClient } = createWrapper(overrides);
      return { ...renderHook(hook, { wrapper: Wrapper, ...options }), queryClient };
    }

    await use(renderWithProviders);
  },
});

export const it = test;
