import type { TransportKeyPair } from "../credentials/types";
import type {
  ClearValue,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  EncryptedValue,
  FheEncryptionKey,
  PublicDecryptResult,
  UserDecryptParams,
} from "./relayer-sdk.types";
import type { Address, Hex } from "viem";

/**
 * Core FHE cryptographic operations — encryption, decryption, key generation,
 * and EIP-712 typed-data construction for decrypt permits.
 */
export interface FheOperations {
  /** Generate a transport key pair (ML-KEM public + private key) used for user-decryption. */
  generateTransportKeyPair(): Promise<TransportKeyPair>;

  /** Create EIP-712 typed data for signing an FHE decrypt credential. */
  createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData>;

  /** Encrypt plaintext values into FHE ciphertexts. */
  encrypt(params: EncryptParams): Promise<EncryptResult>;

  /** Decrypt FHE encrypted values using the user's own credentials. */
  userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<EncryptedValue, ClearValue>>>;

  /** Decrypt encrypted values using the network public key (no credential needed). */
  publicDecrypt(encryptedValues: EncryptedValue[]): Promise<PublicDecryptResult>;

  /** Create EIP-712 typed data for a delegated user decrypt credential. */
  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData>;

  /** Decrypt FHE encrypted values using delegated user credentials. */
  delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>>;

  /** Fetch the network's FHE encryption key. Returns `null` if not available. */
  fetchFheEncryptionKeyBytes(): Promise<FheEncryptionKey | null>;
}

/**
 * Interface for FHE relayer operations.
 * Extends `FheOperations` with lifecycle and chain-specific methods.
 * Implemented by `FhevmRelayer` (drives `@fhevm/sdk`).
 */
export interface RelayerSDK extends FheOperations {
  /** Return the ACL contract address for the current chain. */
  getAclAddress(): Promise<Address>;

  /** Terminate the relayer backend and release resources. */
  terminate(): void;
}
