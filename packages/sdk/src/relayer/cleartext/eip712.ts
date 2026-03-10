import type { TypedDataDomain } from "viem";
import type { Address } from "viem";
import type {
  CoprocessorEIP712TypesType,
  KmsDelegatedUserDecryptEIP712TypesType,
  KmsPublicDecryptEIP712TypesType,
  KmsUserDecryptEIP712TypesType,
} from "@zama-fhe/relayer-sdk/bundle";

type DomainFactory = (chainId: number | bigint, verifyingContract: Address) => TypedDataDomain;

const inputDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "InputVerification",
  version: "1",
  chainId: Number(chainId),
  verifyingContract,
});

const decryptionDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "Decryption",
  version: "1",
  chainId: Number(chainId),
  verifyingContract,
});

export const INPUT_VERIFICATION_EIP712 = {
  domain: inputDomain,
  types: {
    CiphertextVerification: [
      { name: "ctHandles", type: "bytes32[]" },
      { name: "userAddress", type: "address" },
      { name: "contractAddress", type: "address" },
      { name: "contractChainId", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;

export const KMS_DECRYPTION_EIP712 = {
  domain: decryptionDomain,
  types: {
    PublicDecryptVerification: [
      { name: "ctHandles", type: "bytes32[]" },
      { name: "decryptedResult", type: "bytes" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;

export const USER_DECRYPT_EIP712 = {
  domain: decryptionDomain,
  types: {
    UserDecryptRequestVerification: [
      { name: "publicKey", type: "bytes" },
      { name: "contractAddresses", type: "address[]" },
      { name: "startTimestamp", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;

export const DELEGATED_USER_DECRYPT_EIP712 = {
  domain: decryptionDomain,
  types: {
    DelegatedUserDecryptRequestVerification: [
      { name: "publicKey", type: "bytes" },
      { name: "contractAddresses", type: "address[]" },
      { name: "delegatorAddress", type: "address" },
      { name: "startTimestamp", type: "uint256" },
      { name: "durationDays", type: "uint256" },
      { name: "extraData", type: "bytes" },
    ],
  },
} as const;

// ── Compile-time structural checks against relayer-sdk types ──────────
// These assertions ensure our local EIP-712 type arrays stay in sync with
// the relayer-sdk's canonical definitions. A mismatch will cause a build error.
type AssertFieldsMatch<
  Local extends readonly { readonly name: string; readonly type: string }[],
  Canonical extends readonly { readonly name: string; readonly type: string }[],
> = [Local["length"]] extends [Canonical["length"]]
  ? {
      [K in keyof Local]: Local[K] extends { readonly name: infer N; readonly type: infer T }
        ? Canonical[K & keyof Canonical] extends { readonly name: N; readonly type: T }
          ? true
          : { error: `Field mismatch at index ${K & string}` }
        : never;
    }
  : { error: "Field count mismatch" };

// Wrapping in readonly true[] ensures a mismatch produces a compile error
// (not just an inert type alias that TypeScript silently accepts).
type AssertAllTrue<T extends readonly true[]> = T;

type _CheckInput = AssertAllTrue<
  AssertFieldsMatch<
    typeof INPUT_VERIFICATION_EIP712.types.CiphertextVerification,
    CoprocessorEIP712TypesType["CiphertextVerification"]
  >
>;
type _CheckPublicDecrypt = AssertAllTrue<
  AssertFieldsMatch<
    typeof KMS_DECRYPTION_EIP712.types.PublicDecryptVerification,
    KmsPublicDecryptEIP712TypesType["PublicDecryptVerification"]
  >
>;
type _CheckUserDecrypt = AssertAllTrue<
  AssertFieldsMatch<
    typeof USER_DECRYPT_EIP712.types.UserDecryptRequestVerification,
    KmsUserDecryptEIP712TypesType["UserDecryptRequestVerification"]
  >
>;
type _CheckDelegatedDecrypt = AssertAllTrue<
  AssertFieldsMatch<
    typeof DELEGATED_USER_DECRYPT_EIP712.types.DelegatedUserDecryptRequestVerification,
    KmsDelegatedUserDecryptEIP712TypesType["DelegatedUserDecryptRequestVerification"]
  >
>;
