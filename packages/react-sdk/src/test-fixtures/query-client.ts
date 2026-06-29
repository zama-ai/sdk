// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
// oxlint-disable no-empty-pattern
import { QueryClient } from "@tanstack/react-query";
import type { FixturesOf } from "./types";

export interface QueryClientFixtures {
  queryClient: QueryClient;
}

export const queryClientFixtures: FixturesOf<QueryClientFixtures> = {
  queryClient: async ({}, use) => {
    await use(
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    );
  },
};
