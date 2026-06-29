import type {
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
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
  PublicParamsData,
  UserDecryptParams,
} from "./relayer-sdk.types";
import type { Address, Hex } from "viem";

/**
 * Core FHE cryptographic operations — the 10 methods that perform
 * encryption, decryption, key generation, and proof verification.
 */
export interface FheOperations {
  /** Generate a transport key pair (ML-KEM public + private key) used for user-decryption. */
  generateTransportKeyPair(): Promise<TransportKeyPair>;

  /**
   * Create EIP-712 typed data for signing an FHE decrypt credential.
   *
   * Low-level credential builder. Prefer the high-level
   * `sdk.decryption.decryptValues` ({@link Decryption.decryptValues}), which
   * assembles and caches this credential for you.
   */
  createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData>;

  /** Encrypt plaintext values into FHE ciphertexts. */
  encrypt(params: EncryptParams): Promise<EncryptResult>;

  /**
   * Decrypt FHE encrypted values using the user's own credentials.
   *
   * Low-level: the caller assembles the credential bundle (transport key pair,
   * EIP-712 permit) in {@link UserDecryptParams}. Prefer the high-level
   * `sdk.decryption.decryptValues` ({@link Decryption.decryptValues}), which
   * manages credentials, caching, and error wrapping.
   */
  userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<EncryptedValue, ClearValue>>>;

  /**
   * Decrypt encrypted values using the network public key (no credential needed).
   *
   * Low-level. Prefer the high-level `sdk.decryption.decryptPublicValues`
   * ({@link Decryption.decryptPublicValues}).
   */
  publicDecrypt(encryptedValues: EncryptedValue[]): Promise<PublicDecryptResult>;

  /**
   * Create EIP-712 typed data for a delegated user decrypt credential.
   *
   * Low-level credential builder. Prefer the high-level
   * `sdk.decryption.delegatedDecryptValues` ({@link Decryption.delegatedDecryptValues}),
   * which assembles and caches this credential for you.
   */
  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type>;

  /**
   * Decrypt FHE encrypted values using delegated user credentials.
   *
   * Low-level: the caller assembles the delegated credential bundle in
   * {@link DelegatedUserDecryptParams}. Prefer the high-level
   * `sdk.decryption.delegatedDecryptValues` ({@link Decryption.delegatedDecryptValues}).
   */
  delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<EncryptedValue, ClearValue>>>;

  /** Submit a ZK proof for on-chain verification. */
  requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType>;

  /** Fetch the network's FHE encryption key. Returns `null` if not available. */
  fetchFheEncryptionKeyBytes(): Promise<FheEncryptionKey | null>;

  /** Fetch FHE public parameters for a given bit size. Returns `null` if not available. */
  getPublicParams(bits: number): Promise<PublicParamsData | null>;
}

/**
 * Interface for FHE relayer operations.
 * Extends `FheOperations` with lifecycle and chain-specific methods.
 * Implemented by `RelayerWeb` (browser, via Web Worker + WASM) and `RelayerNode` (Node.js, direct).
 */
export interface RelayerSDK extends FheOperations {
  /** Return the ACL contract address for the current chain. */
  getAclAddress(): Promise<Address>;

  /** Terminate the relayer backend and release resources. */
  terminate(): void;
}
