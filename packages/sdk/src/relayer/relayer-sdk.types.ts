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
