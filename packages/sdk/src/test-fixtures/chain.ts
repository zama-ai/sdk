// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import type { Address } from "viem";
import type { FheChain } from "../chains/types";
import type { FixturesOf } from "./types";

const STUB_ADDRESS = "0x0000000000000000000000000000000000000001" as Address;

/**
 * Build a complete {@link FheChain} stub for tests.
 * Use this in tests that only care about `chain.id` but flow through code paths
 * that schema-validate the chain shape (e.g. `RelayerDispatcher`).
 */
function createMockChain(overrides: Partial<FheChain> & { id: number }): FheChain {
  return {
    gatewayChainId: 1,
    relayerUrl: "",
    network: "http://localhost:8545",
    aclContractAddress: STUB_ADDRESS,
    kmsContractAddress: STUB_ADDRESS,
    inputVerifierContractAddress: STUB_ADDRESS,
    verifyingContractAddressDecryption: STUB_ADDRESS,
    verifyingContractAddressInputVerification: STUB_ADDRESS,
    registryAddress: undefined,
    ...overrides,
  } as const;
}

export interface ChainFixtures {
  chain: FheChain;
  createMockChain: typeof createMockChain;
}

export const chainFixtures: FixturesOf<ChainFixtures> = {
  chain: async ({}, use) => {
    await use(createMockChain({ id: 31337 }));
  },
  createMockChain: async ({}, use) => {
    await use(createMockChain);
  },
};

export { createMockChain };
