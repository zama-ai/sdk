// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { FhevmRelayerSDK } from "../relayer/types";
import type { FixturesOf } from "./types";
import {
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY,
  TOKEN,
  VALID_ENCRYPTED_VALUE,
  VALID_INPUT_PROOF,
} from "./constants";
import { anvil } from "../chains";

export function createMockRelayer(overrides: Partial<FhevmRelayerSDK> = {}): FhevmRelayerSDK {
  return {
    chain: anvil,
    init: vi.fn().mockResolvedValue(undefined),
    generateTransportKeyPair: vi
      .fn()
      .mockResolvedValue({ publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY }),
    parseTransportKeyPair: vi.fn().mockImplementation((kp: unknown) => kp),
    serializeTransportKeyPair: vi
      .fn()
      .mockReturnValue({ publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY }),
    // Route through the passed signer so `signer.signTypedData` call-count and
    // rejection assertions stay observable through the new permit-signing flow.
    signDecryptionPermit: vi
      .fn()
      .mockImplementation(
        async (params: {
          signer: { signTypedData: (typedData: unknown) => Promise<string> };
          signerAddress: string;
          delegatorAddress?: string;
          contractAddresses: readonly string[];
        }) => {
          const eip712 = {
            domain: { name: "Decryption", version: "1", chainId: 31337n, verifyingContract: TOKEN },
            types: { UserDecryptRequestVerification: [] },
            primaryType: "UserDecryptRequestVerification",
            message: {
              publicKey: TEST_PUBLIC_KEY,
              contractAddresses: params.contractAddresses,
              startTimestamp: "1000",
              durationDays: "1",
              extraData: "0x",
            },
          };
          const signature = await params.signer.signTypedData(eip712);
          return {
            version: 1,
            eip712,
            signature,
            signerAddress: params.signerAddress,
            encryptedDataOwnerAddress: params.delegatorAddress ?? params.signerAddress,
            transportPublicKey: TEST_PUBLIC_KEY,
            isDelegated: params.delegatorAddress !== undefined,
            assertNotExpired: () => {},
          };
        },
      ),
    serializeSignedDecryptionPermit: vi
      .fn()
      .mockImplementation(
        (params: {
          signedPermit: {
            version: number;
            eip712: unknown;
            signature: string;
            signerAddress: string;
          };
        }) => ({
          version: params.signedPermit.version,
          eip712: params.signedPermit.eip712,
          signature: params.signedPermit.signature,
          signerAddress: params.signedPermit.signerAddress,
        }),
      ),
    parseSignedDecryptionPermit: vi.fn().mockImplementation(async (params: unknown) => params),
    encryptValue: vi
      .fn()
      .mockResolvedValue({ encryptedValue: VALID_ENCRYPTED_VALUE, inputProof: VALID_INPUT_PROOF }),
    encryptValues: vi
      .fn()
      .mockResolvedValue({
        encryptedValues: [VALID_ENCRYPTED_VALUE],
        inputProof: VALID_INPUT_PROOF,
      }),
    decryptValue: vi.fn().mockResolvedValue({ type: "uint64", value: 1000n }),
    decryptValues: vi.fn().mockResolvedValue([{ type: "uint64", value: 1000n }]),
    decryptValuesFromPairs: vi.fn().mockResolvedValue([{ type: "uint64", value: 1000n }]),
    decryptPublicValue: vi.fn().mockResolvedValue({ type: "uint64", value: 500n }),
    decryptPublicValues: vi.fn().mockResolvedValue([{ type: "uint64", value: 500n }]),
    decryptPublicValuesWithSignatures: vi
      .fn()
      .mockImplementation((params: { encryptedValues: readonly string[] }) =>
        Promise.resolve({
          clearValues: params.encryptedValues.map(() => ({ type: "uint64", value: 500n })),
          checkSignaturesArgs: {
            handlesList: params.encryptedValues,
            abiEncodedCleartexts: "0x1f4",
            decryptionProof: "0xproof",
          },
        }),
      ),
    fetchFheEncryptionKeyBytes: vi
      .fn()
      .mockResolvedValue({ publicKeyId: "pk-1", publicKey: new Uint8Array([1]) }),
    ...overrides,
  } satisfies FhevmRelayerSDK;
}

export interface RelayerFixtures {
  relayer: FhevmRelayerSDK;
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
