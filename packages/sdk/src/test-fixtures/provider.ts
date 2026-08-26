// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { GenericProvider } from "../types";
import { TEST_UNSIGNED_TX } from "./constants";
import type { FixturesOf } from "./types";

export function createMockProvider(overrides: Partial<GenericProvider> = {}): GenericProvider {
  return {
    getChainId: vi.fn().mockResolvedValue(31337),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getBlockTimestamp: vi.fn().mockResolvedValue(BigInt(Math.floor(Date.now() / 1000))),
    prepareTransaction: vi.fn().mockResolvedValue(TEST_UNSIGNED_TX),
    ...overrides,
  };
}

export interface ProviderFixtures {
  provider: GenericProvider;
  createMockProvider: typeof createMockProvider;
}

export const providerFixtures: FixturesOf<ProviderFixtures> = {
  provider: async ({}, use) => {
    await use(createMockProvider());
  },
  createMockProvider: async ({}, use) => {
    await use(createMockProvider);
  },
};
