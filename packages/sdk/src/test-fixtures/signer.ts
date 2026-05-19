import { vi } from "vitest";
import type { Address } from "viem";
import type { GenericSigner } from "../types";
import type { AddressFixtures } from "./addresses";
import { TEST_SIGNATURE, TEST_SIGNED_TX, USER } from "./constants";
import type { FixturesOf } from "./types";

/**
 * Test-only signer shape — matches the production {@link GenericSigner}. The
 * read methods intentionally live on `createMockProvider` so tests that assert
 * "reads route through the provider" become observable invariants.
 */
export type MockSigner = GenericSigner;

export function createMockSigner(
  address: Address = USER,
  overrides: Partial<GenericSigner> = {},
): GenericSigner {
  const walletAccount = { address, chainId: 31337 };
  const store = {
    getSnapshot: vi.fn().mockReturnValue(walletAccount),
    subscribe: vi.fn((listener) => {
      listener({ previous: undefined, next: walletAccount });
      return () => {};
    }),
    isReady: vi.fn().mockReturnValue(true),
  };
  return {
    walletAccount: store,
    requireWalletAccount: vi.fn().mockReturnValue(walletAccount),
    signTypedData: vi.fn().mockResolvedValue(TEST_SIGNATURE),
    signTransaction: vi.fn().mockResolvedValue(TEST_SIGNED_TX),
    writeContract: vi.fn().mockResolvedValue("0xtxhash"),
    ...overrides,
  };
}

export type CreateMockSignerFn = (
  addressOrOverrides?: Address | Partial<GenericSigner>,
  overrides?: Partial<GenericSigner>,
) => GenericSigner;

export interface SignerFixtures {
  signer: GenericSigner;
  createMockSigner: CreateMockSignerFn;
}

export const signerFixtures: FixturesOf<SignerFixtures, AddressFixtures> = {
  signer: async ({ userAddress }, use) => {
    await use(createMockSigner(userAddress));
  },
  createMockSigner: async ({ userAddress }, use) => {
    const factory: CreateMockSignerFn = (addressOrOverrides, overridesArg) => {
      if (typeof addressOrOverrides === "string") {
        return createMockSigner(addressOrOverrides, overridesArg ?? {});
      }
      if (typeof addressOrOverrides === "object" && addressOrOverrides !== null) {
        return createMockSigner(userAddress, addressOrOverrides);
      }
      return createMockSigner(userAddress, overridesArg ?? {});
    };
    await use(factory);
  },
};
