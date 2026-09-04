// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { vi } from "vitest";
import type { RelayerSDK } from "../relayer/types";
import type { FixturesOf } from "./types";
import {
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY,
  TEST_TKMS_VERSION,
  TOKEN,
  VALID_ENCRYPTED_VALUE,
  VALID_INPUT_PROOF,
} from "./constants";
import { anvil } from "../chains";

export function createMockRelayer(overrides: Partial<RelayerSDK> = {}): RelayerSDK {
  // Domain chainId mocks derive from this so a test that overrides `chain`
  // (e.g. simulating a multi-chain router) gets an internally consistent
  // EIP-712 domain instead of a hardcoded value from a different chain.
  const chain = overrides.chain ?? anvil;
  return {
    chain,
    generateTransportKeyPair: vi
      .fn()
      .mockResolvedValue({
        publicKey: TEST_PUBLIC_KEY,
        privateKey: TEST_PRIVATE_KEY,
        tkmsVersion: TEST_TKMS_VERSION,
      }),
    parseTransportKeyPair: vi.fn().mockImplementation((kp: unknown) => kp),
    serializeTransportKeyPair: vi
      .fn()
      .mockResolvedValue({
        publicKey: TEST_PUBLIC_KEY,
        privateKey: TEST_PRIVATE_KEY,
        tkmsVersion: TEST_TKMS_VERSION,
      }),
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
            domain: {
              name: "Decryption",
              version: "1",
              chainId: BigInt(chain.id),
              verifyingContract: TOKEN,
            },
            types: { UserDecryptRequestVerification: [] },
            primaryType: "UserDecryptRequestVerification",
            message: {
              publicKey: TEST_PUBLIC_KEY,
              contractAddresses: params.contractAddresses,
              startTimestamp: "1000",
              durationDays: "1",
              extraData: "0x",
              // V1 bakes delegation into the signed message itself, so it's the
              // one piece of "post-sign" info that DOES round-trip through
              // serialize/parse — mirrors real @fhevm/sdk (a V1 signed permit's
              // `encryptedDataOwnerAddress` getter reads `eip712.message.delegatorAddress`).
              ...(params.delegatorAddress && { delegatorAddress: params.delegatorAddress }),
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
    // Mirrors signDecryptionPermit's mock shape but with the V2 (unified) EIP-712
    // primaryType/message fields: `userAddress` and `allowedContracts` instead of
    // a self/delegated primaryType split and `contractAddresses`.
    //
    // Unlike V1, a V2 permit's delegation is real @fhevm/sdk's "post-sign
    // metadata" — never part of the signed `message` — so serializeSignedDecryptionPermit's
    // mock carries it separately as a top-level `delegatorAddress` field (see
    // parseSignedDecryptionPermit's mock below).
    signUnifiedDecryptionPermit: vi
      .fn()
      .mockImplementation(
        async (params: {
          signer: { signTypedData: (typedData: unknown) => Promise<string> };
          signerAddress: string;
          delegatorAddress?: string;
          contractAddresses: readonly string[];
        }) => {
          const eip712 = {
            domain: {
              name: "Decryption",
              version: "1",
              chainId: BigInt(chain.id),
              verifyingContract: TOKEN,
            },
            types: { UserDecryptRequestVerification: [] },
            primaryType: "UserDecryptRequestVerification",
            message: {
              userAddress: params.signerAddress,
              publicKey: TEST_PUBLIC_KEY,
              allowedContracts: params.contractAddresses,
              startTimestamp: "1000",
              durationSeconds: "86400",
              extraData: "0x",
            },
          };
          const signature = await params.signer.signTypedData(eip712);
          return {
            version: 2,
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
    // V2 delegation is "post-sign metadata", not part of the signed
    // `eip712.message` (unlike V1), so it has to be serialized as a separate
    // top-level `delegatorAddress` field, derived from the live signed
    // permit's own `isDelegated`/`encryptedDataOwnerAddress` getters — mirrors
    // real @fhevm/sdk's `serializeSignedDecryptionPermitToJSON`.
    serializeSignedDecryptionPermit: vi
      .fn()
      .mockImplementation(
        async (params: {
          signedPermit: {
            version: number;
            eip712: unknown;
            signature: string;
            signerAddress: string;
            isDelegated?: boolean;
            encryptedDataOwnerAddress?: string;
          };
        }) => ({
          version: params.signedPermit.version,
          eip712: params.signedPermit.eip712,
          signature: params.signedPermit.signature,
          signerAddress: params.signedPermit.signerAddress,
          delegatorAddress: params.signedPermit.isDelegated
            ? params.signedPermit.encryptedDataOwnerAddress
            : undefined,
        }),
      ),
    // Route the registerPermit path through the serializedPermit it verifies,
    // mirroring signDecryptionPermit's fused shape so serializeSignedDecryptionPermit's
    // mock (which reads signedPermit.{version,eip712,signature,signerAddress}) works.
    //
    // Version-dependent delegation recovery, mirroring real @fhevm/sdk: V1
    // recovers `delegatorAddress` from the signed `eip712.message` (it was
    // baked in at sign time — see signDecryptionPermit's mock above). V2
    // recovers it from the top-level `delegatorAddress` field
    // serializeSignedDecryptionPermit's mock now carries alongside the signed
    // message, mirroring parseSignedDecryptionPermitV2.
    parseSignedDecryptionPermit: vi
      .fn()
      .mockImplementation(
        async (params: {
          serializedPermit: {
            version: number;
            eip712: { message?: { delegatorAddress?: string } };
            signature: string;
            signerAddress: string;
            delegatorAddress?: string;
          };
        }) => {
          const delegatorAddress =
            params.serializedPermit.version === 1
              ? params.serializedPermit.eip712.message?.delegatorAddress
              : params.serializedPermit.delegatorAddress;
          return {
            version: params.serializedPermit.version,
            eip712: params.serializedPermit.eip712,
            signature: params.serializedPermit.signature,
            signerAddress: params.serializedPermit.signerAddress,
            encryptedDataOwnerAddress: delegatorAddress ?? params.serializedPermit.signerAddress,
            transportPublicKey: TEST_PUBLIC_KEY,
            isDelegated: delegatorAddress !== undefined,
            assertNotExpired: () => {},
          };
        },
      ),
    // Default to V1 (unsupported) so every existing test keeps exercising the
    // legacy permit path unchanged; a test that needs V2 mocks this `true`.
    canUseUnifiedDecryptionPermit: vi.fn().mockResolvedValue(false),
    // `types`/`primaryType`/`message.delegatorAddress` switch on `params.delegatorAddress`,
    // mirroring `@fhevm/sdk`'s self-vs-delegated V1 EIP-712 shape.
    createUnsignedLegacyDecryptionPermitEip712: vi
      .fn()
      .mockImplementation(
        async (params: {
          contractAddresses: readonly string[];
          startTimestamp: number;
          durationSeconds: number;
          delegatorAddress?: string;
        }) => ({
          domain: {
            name: "Decryption",
            version: "1",
            chainId: BigInt(chain.id),
            verifyingContract: TOKEN,
          },
          types: {
            [params.delegatorAddress
              ? "DelegatedUserDecryptRequestVerification"
              : "UserDecryptRequestVerification"]: [],
          },
          primaryType: params.delegatorAddress
            ? "DelegatedUserDecryptRequestVerification"
            : "UserDecryptRequestVerification",
          message: {
            publicKey: TEST_PUBLIC_KEY,
            contractAddresses: params.contractAddresses,
            startTimestamp: String(params.startTimestamp),
            durationDays: String(Math.floor(params.durationSeconds / 86400)),
            extraData: "0x",
            ...(params.delegatorAddress && { delegatorAddress: params.delegatorAddress }),
          },
        }),
      ),
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
  } satisfies RelayerSDK;
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
