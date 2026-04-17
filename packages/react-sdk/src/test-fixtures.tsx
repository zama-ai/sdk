/* eslint-disable no-empty-pattern */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import React from "react";
import type { RelayerSDK } from "../../sdk/src/relayer/relayer-sdk";
import { test as base } from "../../sdk/src/test-fixtures";
import type { Token } from "../../sdk/src/token";
import type { GenericProvider, GenericSigner, GenericStorage } from "../../sdk/src/types";
import type { ZamaProviderProps } from "./provider";
import { ZamaProvider } from "./provider";
import { createMockToken } from "./__tests__/mutation-test-helpers";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";

// ---------------------------------------------------------------------------
// Internal helpers (not exported — used by fixtures only)
// ---------------------------------------------------------------------------

function Providers({
  children,
  queryClient,
  ...props
}: PropsWithChildren<ZamaProviderProps & { queryClient: QueryClient }>) {
  return (
    <QueryClientProvider client={queryClient}>
      <ZamaProvider {...props}>{children}</ZamaProvider>
    </QueryClientProvider>
  );
}

// ---------------------------------------------------------------------------
// Vitest fixtures (accessed via test context destructuring)
// ---------------------------------------------------------------------------

interface ReactSdkFixtures {
  token: Token;
  queryClient: QueryClient;
  createWrapper: (overrides?: Partial<ZamaProviderProps>) => {
    Wrapper: React.FC<{ children?: React.ReactNode }>;
    queryClient: QueryClient;
    signer: GenericSigner | undefined;
    provider: GenericProvider;
    relayer: RelayerSDK;
    storage: GenericStorage;
  };
  renderWithProviders: <TResult>(
    hook: () => TResult,
    overrides?: Partial<ZamaProviderProps>,
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
  createWrapper: async (
    { relayer, provider, signer, storage, sessionStorage, queryClient },
    use,
  ) => {
    function createWrapper(overrides?: Partial<ZamaProviderProps>) {
      const props = { relayer, provider, signer, storage, sessionStorage, ...overrides };

      function Wrapper({ children }: { children?: React.ReactNode }) {
        return (
          <Providers queryClient={queryClient} {...props}>
            {children}
          </Providers>
        );
      }

      return {
        Wrapper,
        queryClient,
        signer: props.signer,
        provider: props.provider,
        relayer: props.relayer,
        storage: props.storage,
      };
    }
    await use(createWrapper);
  },
  renderWithProviders: async ({ createWrapper }, use) => {
    function renderWithProviders<TResult>(
      hook: () => TResult,
      overrides?: Partial<ZamaProviderProps>,
      options?: Omit<RenderHookOptions<unknown>, "wrapper">,
    ) {
      const { Wrapper, queryClient } = createWrapper(overrides);
      return { ...renderHook(hook, { wrapper: Wrapper, ...options }), queryClient };
    }
    await use(renderWithProviders);
  },
});

export const it = test;
