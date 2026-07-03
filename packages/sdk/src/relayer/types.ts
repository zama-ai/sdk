import type { Eip712Like, TypedValue } from "@fhevm/sdk/types";
import type { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import type { Address, Hex } from "viem";
import type { FheChain } from "../chains/types";

// ============================================================================
// Application Types
//
// zama-sdk's canonical domain shapes. The FHE backend (`FhevmRelayer` + the
// `@fhevm/sdk` engine) translates between these and `@fhevm/sdk`'s API, so the
// rest of the SDK (token, namespaces, credentials, signer) keeps a stable
// surface independent of the underlying FHE library.
// ============================================================================

/** Canonical SDK type for an encrypted value — a `bytes32` ciphertext reference. */
export type EncryptedValue = Hex;

/** Canonical SDK type for a decrypted clear-text value. */
export type ClearValue = TypedValue["value"] | bigint | string | undefined;

/** A single value to encrypt with its FHE type. */
export type EncryptInput =
  | { readonly type: Exclude<TypedValue["type"], "bool" | "address">; readonly value: bigint }
  | { readonly type: "bool"; readonly value: boolean | 1n | 0n }
  | { readonly type: "address"; readonly value: Address };

/** Parameters for encryption */
export interface EncryptParams {
  /** Typed inputs for encryption. Each value must specify its FHE type. */
  readonly values: readonly EncryptInput[];
  contractAddress: Address;
  userAddress: Address;
}

/** Result from encryption — contract-ready hex encrypted values and input proof. */
export interface EncryptResult {
  readonly encryptedValues: readonly EncryptedValue[];
  inputProof: Hex;
}

/** Result from public decryption. */
export interface DecryptPublicValuesResult {
  readonly clearValues: Record<EncryptedValue, ClearValue>;
  abiEncodedClearValues: Hex;
  decryptionProof: Hex;
}

/**
 * EIP-712 typed data for a (delegated) user-decrypt permit. Built by the FHE
 * backend and handed to the signer layer (`GenericSigner.signTypedData`), which
 * forwards it to the wallet. A structural shape — the SDK's contract is "sign
 * this typed data", independent of the specific KMS permit variant `@fhevm/sdk`
 * produces (which is versioned and evolves).
 */
export type EIP712TypedData = Eip712Like;

/** The underlying client returned by `@fhevm/sdk`'s `createFhevmClient`. */
export type FhevmClient = ReturnType<typeof createFhevmClient>;

/** Per-client `@fhevm/sdk` options (`batchRpcCalls`, `fheEncryptionKey`). */
export type FhevmClientOptions = NonNullable<Parameters<typeof createFhevmClient>[0]["options"]>;

/**
 * Global `@fhevm/sdk` runtime config — WASM load mode, threads, logger, auth,
 * module versions. Applied once per process (the underlying `setFhevmRuntimeConfig`
 * is one-shot and idempotent; conflicting configs across chains will throw).
 */
export type FhevmRuntimeConfig = Parameters<typeof setFhevmRuntimeConfig>[0];

/** Serialized transport key pair as it crosses the signer / worker boundary. */
export interface SerializedTransportKeyPair {
  publicKey: Hex;
  privateKey: Hex;
}

/**
 * Single-chain FHE backend contract. Implemented by `FhevmRelayer` (drives
 * `@fhevm/sdk`); translates between the domain shapes above and the engine's API.
 */
export interface FhevmRelayerSDK extends Pick<
  FhevmClient,
  | "encryptValue"
  | "encryptValues"
  | "decryptPublicValue"
  | "decryptPublicValues"
  | "decryptPublicValuesWithSignatures"
  | "decryptValue"
  | "decryptValues"
  | "decryptValuesFromPairs"
  | "fetchFheEncryptionKeyBytes"
  | "generateTransportKeyPair"
  | "serializeTransportKeyPair"
  | "serializeSignedDecryptionPermit"
  | "signDecryptionPermit"
  | "parseTransportKeyPair"
  | "parseSignedDecryptionPermit"
> {
  chain: FheChain;
}
