// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { type Abi, encodeFunctionData, serializeTransaction } from "viem";
import { vi } from "vitest";
import type { GenericProvider } from "../types";
import type { FixturesOf } from "./types";

export function createMockProvider(overrides: Partial<GenericProvider> = {}): GenericProvider {
  return {
    getChainId: vi.fn().mockResolvedValue(31337),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    getBlockTimestamp: vi.fn().mockResolvedValue(BigInt(Math.floor(Date.now() / 1000))),
    prepareTransaction: vi
      .fn()
      .mockImplementation(async ({ calldata, nonce }) =>
        serializeTransaction({
          type: "eip1559",
          chainId: 31337,
          nonce: nonce ?? 0,
          to: calldata.address,
          data: encodeFunctionData({
            abi: calldata.abi as Abi,
            functionName: calldata.functionName,
            args: calldata.args,
          }),
          value: calldata.value ?? 0n,
          gas: 100_000n,
          maxFeePerGas: 1n,
          maxPriorityFeePerGas: 1n,
        }),
      ),
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
