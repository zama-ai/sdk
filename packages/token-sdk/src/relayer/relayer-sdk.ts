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
  UserDecryptParams,
  ZKProofLike,
} from "./relayer-sdk.types";

/**
 * Interface for FHE relayer operations.
 * Implemented by `RelayerWeb` (browser, via Web Worker) and `RelayerNode` (Node.js, direct).
 */
export interface RelayerSDK {
  generateKeypair(): Promise<FHEKeypair>;

  createEIP712(
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ): Promise<EIP712TypedData>;

  encrypt(params: EncryptParams): Promise<EncryptResult>;

  userDecrypt(params: UserDecryptParams): Promise<Record<string, bigint>>;

  publicDecrypt(handles: string[]): Promise<PublicDecryptResult>;

  createDelegatedUserDecryptEIP712(
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays?: number,
  ): Promise<KmsDelegatedUserDecryptEIP712Type>;

  delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<Record<string, bigint>>;

  requestZKProofVerification(
    zkProof: ZKProofLike,
  ): Promise<InputProofBytesType>;

  getPublicKey(): Promise<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null>;

  getPublicParams(
    bits: number,
  ): Promise<{ publicParams: Uint8Array; publicParamsId: string } | null>;

  terminate(): void;
}
