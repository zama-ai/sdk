// oxlint-disable no-empty-pattern
import type { QueryClient } from "@tanstack/query-core";
import type { FixturesOf } from "./types";

/**
 * Build a minimal TanStack QueryFunctionContext for testing query factories.
 * Includes `client`, `signal`, and `meta` — the real shape TanStack passes
 * at runtime. The `client` is a dummy (none of our factories use it).
 */
function buildMockQueryContext<TQueryKey extends readonly unknown[]>(queryKey: TQueryKey) {
  return {
    queryKey,
    // Our factories never access client — they extract params from queryKey.
    // A typed stub satisfies the QueryFunctionContext contract without pulling
    // in a real QueryClient + its transitive deps.
    client: {} as QueryClient,
    signal: AbortSignal.timeout(5000),
    meta: undefined,
  };
}

export type MockQueryContextFn = typeof buildMockQueryContext;

export interface QueryContextFixtures {
  mockQueryContext: MockQueryContextFn;
}

export const queryContextFixtures: FixturesOf<QueryContextFixtures> = {
  mockQueryContext: async ({}, use) => {
    await use(buildMockQueryContext);
  },
};
