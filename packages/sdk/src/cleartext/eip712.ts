/**
 * Shared EIP-712 utilities and pre-built type definitions for cleartext signing operations.
 *
 * @module
 */

import {
  keccak256,
  concat,
  toBytes,
  toHex,
  encodeAbiParameters,
  type Hex,
  type TypedDataDomain,
} from "viem";
import {
  CoprocessorEIP712TypesType,
  KmsDelegatedUserDecryptEIP712TypesType,
  KmsPublicDecryptEIP712TypesType,
  KmsUserDecryptEIP712TypesType,
} from "../relayer/relayer-sdk.types";

/**
 * Drop-in replacement for ethers' `AbiCoder.defaultAbiCoder()`.
 * Exposes an `encode(types, values)` method backed by viem's `encodeAbiParameters`.
 */
export const abiCoder = {
  encode(types: string[], values: unknown[]): Hex {
    const params = types.map((t) => ({ type: t }));
    return encodeAbiParameters(params, values);
  },
};

export const EIP712_DOMAIN_TYPEHASH = keccak256(
  toBytes("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
);

const VERSION_HASH = keccak256(toBytes("1"));

/** Pre-computed name hashes for the two signing domains. */
const NAME_HASH_CACHE: Record<string, Hex> = {};
function getNameHash(name: string): Hex {
  return (NAME_HASH_CACHE[name] ??= keccak256(toBytes(name)));
}

/**
 * Build an EIP-712 domain separator.
 *
 * @param name - The signing domain name (e.g. "Decryption", "InputVerification")
 * @param chainId - Chain ID for the domain
 * @param verifyingContract - Address of the verifying contract
 */
export function buildDomainSeparator(
  name: string,
  chainId: number,
  verifyingContract: string,
): Hex {
  return keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "uint256", "address"],
      [EIP712_DOMAIN_TYPEHASH, getNameHash(name), VERSION_HASH, chainId, verifyingContract],
    ),
  );
}

/**
 * Compute a full EIP-712 digest from a domain separator and struct hash.
 */
export function eip712Digest(domainSeparator: string, structHash: string): Hex {
  return keccak256(concat([toHex(0x1901, { size: 2 }), domainSeparator as Hex, structHash as Hex]));
}

// ---------------------------------------------------------------------------
// Pre-built EIP-712 type definitions for all four signing flows.
// ---------------------------------------------------------------------------

type DomainFactory = (chainId: number | bigint, verifyingContract: string) => TypedDataDomain;

const inputDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "InputVerification",
  version: "1",
  chainId: Number(chainId),
  verifyingContract: verifyingContract as `0x${string}`,
});

const decryptionDomain: DomainFactory = (chainId, verifyingContract) => ({
  name: "Decryption",
  version: "1",
  chainId: Number(chainId),
  verifyingContract: verifyingContract as `0x${string}`,
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
