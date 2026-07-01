import type {
  CreateKmsDelegatedUserDecryptEip712ReturnType,
  CreateKmsUserDecryptEip712ReturnType,
  ParseSignedDecryptionPermitParameters,
  SerializeTransportKeyPairReturnType,
} from "@fhevm/sdk/actions/chain";
import type { EncryptValuesParameters } from "@fhevm/sdk/actions/encrypt";
import type { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import type { Address, Hex } from "viem";
import type { FheChain } from "../chains/types";
import type { TypedValue } from "@fhevm/sdk/types";

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

/** Result from encryption — contract-ready hex encrypted values and input proof. */
export interface EncryptResult {
  encryptedValues: EncryptedValue[];
  inputProof: Hex;
}

/** Canonical SDK type for a decrypted clear-text value. */
export type ClearValue = TypedValue["value"] | bigint | string | undefined;

/** A single value to encrypt with its FHE type. */
export type EncryptInput =
  | { value: bigint; type: Exclude<TypedValue["type"], "bool" | "address"> }
  | { value: boolean | 1n | 0n; type: "bool" }
  | { value: Address; type: "address" };

/** Parameters for encryption */
export interface EncryptParameters extends EncryptValuesParameters {
  /** Typed inputs for encryption. Each value must specify its FHE type. */
  values: EncryptInput[];
  contractAddress: Address;
  userAddress: Address;
}

/** Result from public decryption. */
export interface DecryptPublicValuesResult {
  clearValues: Readonly<Record<EncryptedValue, ClearValue>>;
  abiEncodedClearValues: Hex;
  decryptionProof: Hex;
}

/**
 * EIP-712 typed data for a (delegated) user-decrypt permit — the discriminated
 * union `@fhevm/sdk` produces, keyed by `primaryType`. Built by the FHE backend
 * and signed by the signer layer (`GenericSigner.signTypedData`).
 */
export type EIP712TypedData =
  | CreateKmsUserDecryptEip712ReturnType
  | CreateKmsDelegatedUserDecryptEip712ReturnType;

// ============================================================================
// `@fhevm/sdk`-derived types
//
// Shapes inferred from the underlying `@fhevm/sdk` engine. Kept here (rather
// than inlined in `FhevmRelayer`) so the relayer layer shares one source of
// truth for the engine's client, options, and serialized boundary types.
// ============================================================================

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
export type SerializedTransportKeyPair = SerializeTransportKeyPairReturnType;

/** Serialized signed decryption permit as it crosses the signer / worker boundary. */
export type SerializedSignedPermit = ParseSignedDecryptionPermitParameters["serializedPermit"];

// ============================================================================
// Relayer backend interface
// ============================================================================

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
