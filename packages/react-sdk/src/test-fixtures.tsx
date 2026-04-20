/* eslint-disable no-empty-pattern */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import React from "react";
import type { RelayerSDK } from "../../sdk/src/relayer/relayer-sdk";
import { test as base } from "../../sdk/src/test-fixtures";
import type { Token } from "../../sdk/src/token";
import type { GenericSigner, GenericStorage } from "../../sdk/src/types";
import type { ZamaConfig } from "./config";
import { ZamaProvider } from "./provider";
import { createMockToken } from "./__tests__/mutation-test-helpers";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Internal helpers (not exported — used by fixtures only)
// ---------------------------------------------------------------------------

function Providers({
  children,
  queryClient,
  config,
}: PropsWithChildren<{ queryClient: QueryClient; config: ZamaConfig }>) {
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
  createWrapper: (overrides?: Partial<ZamaConfig>) => {
    Wrapper: React.FC<{ children?: React.ReactNode }>;
    queryClient: QueryClient;
    signer: GenericSigner | undefined;
    relayer: RelayerSDK;
    storage: GenericStorage;
  };
  renderWithProviders: <TResult>(
    hook: () => TResult,
    overrides?: Partial<ZamaConfig>,
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
    function createWrapper(overrides?: Partial<ZamaConfig>) {
      const config: ZamaConfig = {
        relayer,
        signer,
        storage,
        sessionStorage,
        keypairTTL: undefined,
        sessionTTL: undefined,
        registryTTL: undefined,
        onEvent: undefined,
        ...overrides,
      };

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
        relayer: config.relayer,
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
      return { ...renderHook(hook, { wrapper: Wrapper, ...options }), queryClient };
    }
    await use(renderWithProviders);
  },
});

export const it = test;
