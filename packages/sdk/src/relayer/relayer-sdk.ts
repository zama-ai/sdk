import type {
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type {
  ClearValueType,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  PublicKeyData,
  PublicParamsData,
  UserDecryptParams,
} from "./relayer-sdk.types";
import type { Address, Hex } from "viem";

/**
 * Core FHE cryptographic operations — the 10 methods that perform
 * encryption, decryption, key generation, and proof verification.
 */
export interface FheOperations {
  /** Generate an FHE keypair (public + private key). */
  generateKeypair(): Promise<KeypairType<Hex>>;

  /** Create EIP-712 typed data for signing an FHE decrypt credential. */
  createEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData>;

  /** Encrypt plaintext values into FHE ciphertexts. */
  encrypt(params: EncryptParams): Promise<EncryptResult>;

  /** Decrypt FHE ciphertext handles using the user's own credentials. */
  userDecrypt(params: UserDecryptParams): Promise<Readonly<Record<Handle, ClearValueType>>>;

  /** Decrypt FHE handles using the network public key (no credential needed). */
  publicDecrypt(handles: Handle[]): Promise<PublicDecryptResult>;

  /** Create EIP-712 typed data for a delegated user decrypt credential. */
  createDelegatedUserDecryptEIP712(
    publicKey: Hex,
    contractAddresses: Address[],
    delegatorAddress: Address,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type>;

  /** Decrypt FHE handles using delegated user credentials. */
  delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Readonly<Record<Handle, ClearValueType>>>;

  /** Submit a ZK proof for on-chain verification. */
  requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType>;

  /** Fetch the FHE network public key. Returns `null` if not available. */
  getPublicKey(): Promise<PublicKeyData | null>;

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
