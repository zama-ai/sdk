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
import type { PropsWithChildren } from "react";
import React from "react";
import { test as base } from "../../sdk/src/test-fixtures";
import type { ZamaConfig } from "./config";
import type { ZamaProviderProps } from "./provider";
import { ZamaProvider } from "./provider";
import { createMockToken } from "./__tests__/mutation-test-helpers";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Internal helpers (not exported — used by fixtures only)
// ---------------------------------------------------------------------------

function buildMockZamaConfig(overrides: {
  relayer?: RelayerSDK;
  signer?: GenericSigner;
  storage?: GenericStorage;
  sessionStorage?: GenericStorage;
  keypairTTL?: number;
  onEvent?: ZamaSDKEventListener;
}): ZamaConfig {
  return {
    _relayer: overrides.relayer,
    _signer: overrides.signer,
    _storage: overrides.storage,
    _sessionStorage: overrides.sessionStorage,
    _keypairTTL: overrides.keypairTTL,
    _sessionTTL: undefined,
    _registryAddresses: undefined,
    _registryTTL: undefined,
    _onEvent: overrides.onEvent,
  } as unknown as ZamaConfig;
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

// ---------------------------------------------------------------------------
// Vitest fixtures (accessed via test context destructuring)
// ---------------------------------------------------------------------------

interface ReactSdkFixtures {
  token: Token;
  queryClient: QueryClient;
  createWrapper: (overrides?: {
    relayer?: RelayerSDK;
    signer?: GenericSigner;
    storage?: GenericStorage;
    sessionStorage?: GenericStorage;
    keypairTTL?: number;
    onEvent?: ZamaSDKEventListener;
  }) => {
    Wrapper: React.FC<{ children?: React.ReactNode }>;
    queryClient: QueryClient;
    signer: GenericSigner | undefined;
    relayer: RelayerSDK;
    storage: GenericStorage;
  };
  renderWithProviders: <TResult>(
    hook: () => TResult,
    overrides?: {
      relayer?: RelayerSDK;
      signer?: GenericSigner;
      storage?: GenericStorage;
      sessionStorage?: GenericStorage;
    },
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
  createWrapper: async ({ relayer, signer, storage, sessionStorage, queryClient }, use) => {
    function createWrapper(overrides?: {
      relayer?: RelayerSDK;
      signer?: GenericSigner;
      storage?: GenericStorage;
      sessionStorage?: GenericStorage;
      keypairTTL?: number;
      onEvent?: ZamaSDKEventListener;
    }) {
      const mergedRelayer = overrides?.relayer ?? relayer;
      const mergedSigner = overrides?.signer ?? signer;
      const mergedStorage = overrides?.storage ?? storage;
      const mergedSessionStorage = overrides?.sessionStorage ?? sessionStorage;

      const config = buildMockZamaConfig({
        relayer: mergedRelayer as RelayerSDK,
        signer: mergedSigner,
        storage: mergedStorage,
        sessionStorage: mergedSessionStorage,
        keypairTTL: overrides?.keypairTTL,
        onEvent: overrides?.onEvent,
      });

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
        signer: mergedSigner,
        relayer: mergedRelayer,
        storage: mergedStorage,
      };
    }
    await use(createWrapper);
  },
  renderWithProviders: async ({ createWrapper }, use) => {
    function renderWithProviders<TResult>(
      hook: () => TResult,
      overrides?: {
        relayer?: RelayerSDK;
        signer?: GenericSigner;
        storage?: GenericStorage;
        sessionStorage?: GenericStorage;
      },
      options?: Omit<RenderHookOptions<unknown>, "wrapper">,
    ) {
      const { Wrapper, queryClient } = createWrapper(overrides);
      return { ...renderHook(hook, { wrapper: Wrapper, ...options }), queryClient };
    }
    await use(renderWithProviders);
  },
});

export const it = test;
