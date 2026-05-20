// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { FixturesOf } from "./types";
import { ACL, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY, VALID_HANDLE } from "./constants";

export function createMockRelayer(overrides: Partial<RelayerSDK> = {}): RelayerSDK {
  return {
    chains: [{ id: 31337 }],
    activeChain: { id: 31337 },
    switchChain: vi.fn(),
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: TEST_PUBLIC_KEY,
      privateKey: TEST_PRIVATE_KEY,
    }),
    createEIP712: vi
      .fn()
      .mockImplementation((publicKey, contractAddresses, startTimestamp, durationDays) =>
        Promise.resolve({
          domain: {
            name: "test",
            version: "1",
            chainId: 1,
            verifyingContract: "0xkms",
          },
          types: { UserDecryptRequestVerification: [] },
          message: {
            publicKey,
            contractAddresses,
            startTimestamp,
            durationDays,
            extraData: "0x",
          },
        }),
      ),
    encrypt: vi.fn().mockResolvedValue({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    }),
    userDecrypt: vi.fn().mockResolvedValue({
      [VALID_HANDLE as string]: 1000n,
    }),
    publicDecrypt: vi.fn().mockImplementation((handles: string[]) => {
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
      .mockImplementation(
        (publicKey, contractAddresses, delegatorAddress, startTimestamp, durationDays) =>
          Promise.resolve({
            domain: {
              name: "test",
              version: "1",
              chainId: 1,
              verifyingContract: "0xkms",
            },
            types: { DelegatedUserDecryptRequestVerification: [] },
            message: {
              publicKey,
              contractAddresses,
              delegatorAddress,
              startTimestamp,
              durationDays,
              extraData: "0x",
            },
          }),
      ),
    delegatedUserDecrypt: vi.fn().mockResolvedValue({
      [VALID_HANDLE as string]: 1000n,
    }),
    requestZKProofVerification: vi.fn(),
    getAclAddress: vi.fn().mockResolvedValue(ACL),
    getPublicKey: vi.fn().mockResolvedValue({
      publicKeyId: "pk-1",
      publicKey: new Uint8Array([1]),
    }),
    getPublicParams: vi.fn().mockResolvedValue({
      publicParams: new Uint8Array([2]),
      publicParamsId: "pp-1",
    }),
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
