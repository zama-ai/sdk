import type { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import type { Address, Hex } from "viem";

// ============================================================================
// Application Types
//
// zama-sdk's canonical domain shapes. The FHE backend (`FhevmRelayer` + the
// `@fhevm/sdk` engine) translates between these and `@fhevm/sdk`'s API, so the
// rest of the SDK (token, namespaces, credentials, signer) keeps a stable
// surface independent of the underlying FHE library.
// ============================================================================

/** Network configuration for the relayer. */
export type NetworkType = "hardhat" | "sepolia" | "mainnet";

/** Canonical FHE type names accepted by encryption. */
export type FheTypeName =
  | "ebool"
  | "euint8"
  | "euint16"
  | "euint32"
  | "euint64"
  | "euint128"
  | "euint256"
  | "eaddress";

/** Canonical SDK type for an encrypted value — a `bytes32` ciphertext reference. */
export type EncryptedValue = Hex;

/** Result from encryption — contract-ready hex encrypted values and input proof. */
export type EncryptResult = {
  encryptedValues: EncryptedValue[];
  inputProof: Hex;
};

/** Canonical SDK type for a decrypted clear-text value. */
export type ClearValue = bigint | boolean | string;

/** A single value to encrypt with its FHE type. */
export type EncryptInput =
  | {
      value: boolean | bigint;
      type: "ebool";
    }
  | {
      value: bigint;
      type: Exclude<FheTypeName, "ebool" | "eaddress">;
    }
  | {
      value: Address;
      type: "eaddress";
    };

/** Parameters for encryption */
export interface EncryptParams {
  /** Typed inputs for encryption. Each value must specify its FHE type. */
  values: EncryptInput[];
  contractAddress: Address;
  userAddress: Address;
}

/** Parameters for user decryption */
export interface UserDecryptParams {
  encryptedValues: EncryptedValue[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: Hex;
  publicKey: Hex;
  signature: Hex;
  signerAddress: Address;
  startTimestamp: number;
  durationDays: number;
}

/** Result from public decryption. */
export interface PublicDecryptResult {
  clearValues: Readonly<Record<EncryptedValue, ClearValue>>;
  abiEncodedClearValues: Hex;
  decryptionProof: Hex;
}

/**
 * EIP-712 typed data for a (delegated) user-decrypt permit. Built by the FHE
 * backend and signed by the signer layer (`GenericSigner.signTypedData`).
 */
export interface EIP712TypedData {
  domain: Record<string, unknown>;
  types: Record<string, ReadonlyArray<{ name: string; type: string }>>;
  primaryType: string;
  message: Record<string, unknown>;
}

/** FHE encryption key — the network's TFHE public key used to encrypt inputs for confidential contracts. */
export interface FheEncryptionKey {
  publicKeyId: string;
  publicKey: Uint8Array;
}

/** TFHE public parameters (managed internally by `@fhevm/sdk`). */
export type PublicParamsData = unknown;

/** Parameters for delegated user decryption */
export interface DelegatedUserDecryptParams {
  encryptedValues: EncryptedValue[];
  contractAddress: Address;
  signedContractAddresses: Address[];
  privateKey: Hex;
  publicKey: Hex;
  signature: Hex;
  delegatorAddress: Address;
  delegateAddress: Address;
  startTimestamp: number;
  durationDays: number;
}

/** SDK status */
export type RelayerSDKStatus = "idle" | "initializing" | "ready" | "error";

// ============================================================================
// `@fhevm/sdk`-derived types
//
// Shapes inferred from the underlying `@fhevm/sdk` engine. Kept here (rather
// than inlined in `FhevmRelayer`) so the relayer layer shares one source of
// truth for the engine's client, options, and serialized boundary types.
// ============================================================================

/** The underlying client returned by `@fhevm/sdk`'s `createFhevmClient`. */
export type FhevmSdkClient = ReturnType<typeof createFhevmClient>;

/** Per-client `@fhevm/sdk` options (`batchRpcCalls`, `fheEncryptionKey`). */
export type FhevmClientOptions = NonNullable<Parameters<typeof createFhevmClient>[0]["options"]>;

/**
 * Global `@fhevm/sdk` runtime config — WASM load mode, threads, logger, auth,
 * module versions. Applied once per process (the underlying `setFhevmRuntimeConfig`
 * is one-shot and idempotent; conflicting configs across chains will throw).
 */
export type FhevmRuntimeConfig = Parameters<typeof setFhevmRuntimeConfig>[0];

/** Serialized transport key pair as it crosses the signer / worker boundary. */
export type SerializedTransportKeyPair = ReturnType<FhevmSdkClient["serializeTransportKeyPair"]>;

/** Serialized signed decryption permit as it crosses the signer / worker boundary. */
export type SerializedSignedPermit = Parameters<
  FhevmSdkClient["parseSignedDecryptionPermit"]
>[0]["serializedPermit"];

/** A handle/contract pair to user-decrypt. */
export interface DecryptPair {
  readonly encryptedValue: EncryptedValue;
  readonly contractAddress: Address;
}
