// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { FixturesOf } from "./types";
import { ACL, TEST_PRIVATE_KEY, TEST_PUBLIC_KEY, TOKEN, VALID_HANDLE } from "./constants";

export function createMockRelayer(overrides: Partial<RelayerSDK> = {}): RelayerSDK {
  return {
    chains: [{ id: 31337 }],
    activeChain: { id: 31337 },
    switchChain: vi.fn(),
    generateKeypair: vi.fn().mockResolvedValue({
      publicKey: TEST_PUBLIC_KEY,
      privateKey: TEST_PRIVATE_KEY,
    }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: TEST_PUBLIC_KEY,
        contractAddresses: [TOKEN],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi.fn().mockResolvedValue({
      encryptedValues: ["0x010203"],
      inputProof: "0x040506",
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
    createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({
      domain: {
        name: "test",
        version: "1",
        chainId: 1,
        verifyingContract: "0xkms",
      },
      types: { DelegatedUserDecryptRequestVerification: [] },
      message: {},
    }),
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
