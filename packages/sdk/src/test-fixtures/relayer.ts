// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { RelayerSDK } from "../relayer/types";
import type { FixturesOf } from "./types";
import {
  ACL,
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY,
  TOKEN,
  VALID_ENCRYPTED_VALUE,
  VALID_INPUT_PROOF,
} from "./constants";

export function createMockRelayer(overrides: Partial<RelayerSDK> = {}): RelayerSDK {
  return {
    chains: [{ id: 31337 }],
    activeChain: { id: 31337 },
    switchChain: vi.fn(),
    generateTransportKeyPair: vi
      .fn()
      .mockResolvedValue({ publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY }),
    createEIP712: vi
      .fn()
      .mockResolvedValue({
        domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
        types: { UserDecryptRequestVerification: [] },
        message: {
          publicKey: TEST_PUBLIC_KEY,
          contractAddresses: [TOKEN],
          startTimestamp: 1000n,
          durationDays: 1n,
          extraData: "0x",
        },
      }),
    encrypt: vi
      .fn()
      .mockResolvedValue({
        encryptedValues: [VALID_ENCRYPTED_VALUE],
        inputProof: VALID_INPUT_PROOF,
      }),
    decryptValues: vi.fn().mockResolvedValue({ [VALID_ENCRYPTED_VALUE as string]: 1000n }),
    decryptPublicValues: vi.fn().mockImplementation((handles: string[]) => {
      const clearValues: Record<string, bigint> = {};
      for (const h of handles) {
        clearValues[h] = 500n;
      }
      return Promise.resolve({
        clearValues,
        abiEncodedClearValues: "0x1f4",
        decryptionProof: "0xproof",
      });
    }),
    createDelegatedUserDecryptEIP712: vi
      .fn()
      .mockResolvedValue({
        domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0xkms" },
        types: { DelegatedUserDecryptRequestVerification: [] },
        message: {},
      }),
    delegatedDecryptValues: vi.fn().mockResolvedValue({ [VALID_ENCRYPTED_VALUE as string]: 1000n }),
    getAclAddress: vi.fn().mockReturnValue(ACL),
    fetchFheEncryptionKeyBytes: vi
      .fn()
      .mockResolvedValue({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) }),
    terminate: vi.fn(),
    ...overrides,
  } as unknown as RelayerSDK;
}

export interface RelayerFixtures {
  relayer: RelayerSDK;
  createMockRelayer: typeof createMockRelayer;
}

export const relayerFixtures: FixturesOf<RelayerFixtures> = {
  relayer: async ({}, use) => {
    await use(createMockRelayer());
  },
  createMockRelayer: async ({}, use) => {
    await use(createMockRelayer);
  },
};
