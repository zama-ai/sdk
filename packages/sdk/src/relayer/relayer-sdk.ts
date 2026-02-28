import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  FHEKeypair,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  PublicDecryptResult,
  RelayerSDKStatus,
  UserDecryptParams,
  ZKProofLike,
} from "./relayer-sdk.types";

/**
 * Interface for FHE relayer operations.
 * Implemented by `RelayerWeb` (browser, via Web Worker + WASM) and `RelayerNode` (Node.js, direct).
 */
export interface RelayerSDK {
  /** Generate an FHE keypair (public + private key). */
  generateKeypair(): Promise<FHEKeypair>;

  /** Create EIP-712 typed data for signing an FHE decrypt credential. */
  createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData>;

  /** Encrypt plaintext values into FHE ciphertexts. */
  encrypt(params: EncryptParams): Promise<EncryptResult>;

  /** Decrypt FHE ciphertext handles using the user's own credentials. */
  userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>>;

  /** Decrypt FHE handles using the network public key (no credential needed). */
  publicDecrypt(handles: string[]): Promise<PublicDecryptResult>;

  /** Create EIP-712 typed data for a delegated user decrypt credential. */
  createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type>;

  /** Decrypt FHE handles using delegated user credentials. */
  delegatedUserDecrypt(params: DelegatedUserDecryptParams): Promise<Record<string, bigint>>;

  /** Submit a ZK proof for on-chain verification. */
  requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType>;

  /** Fetch the FHE network public key. Returns `null` if not available. */
  getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null>;

  /** Fetch FHE public parameters for a given bit size. Returns `null` if not available. */
  getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null>;

  /** Terminate the relayer backend and release resources. */
  terminate(): void;

  /** Get the current lifecycle status. Only implemented by RelayerWeb. */
  getStatus?(): RelayerSDKStatus;
  /** Subscribe to status changes. Only implemented by RelayerWeb. */
  onStatusChange?(listener: (status: RelayerSDKStatus) => void): () => void;
}
