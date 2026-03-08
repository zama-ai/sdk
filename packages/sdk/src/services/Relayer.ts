import { Context, Effect } from "effect";
import type {
  ClearValueType,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type {
  Address,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  UserDecryptParams,
} from "../relayer/relayer-sdk.types";
import type { EncryptionFailed, DecryptionFailed, RelayerRequestFailed } from "../errors";

export interface RelayerService {
  readonly encrypt: (params: EncryptParams) => Effect.Effect<EncryptResult, EncryptionFailed>;
  readonly userDecrypt: (
    params: UserDecryptParams,
  ) => Effect.Effect<
    Readonly<Record<Handle, ClearValueType>>,
    DecryptionFailed | RelayerRequestFailed
  >;
  readonly publicDecrypt: (
    handles: Handle[],
  ) => Effect.Effect<PublicDecryptResult, DecryptionFailed>;
  readonly generateKeypair: () => Effect.Effect<KeypairType<string>, EncryptionFailed>;
  readonly createEIP712: (
    publicKey: string,
    contractAddresses: Address[],
    startTimestamp: number,
    durationDays?: number,
  ) => Effect.Effect<EIP712TypedData, EncryptionFailed>;
  readonly createDelegatedUserDecryptEIP712: (
    publicKey: string,
    contractAddresses: Address[],
    delegatorAddress: string,
    startTimestamp: number,
    durationDays?: number,
  ) => Effect.Effect<KmsDelegatedUserDecryptEIP712Type, EncryptionFailed>;
  readonly delegatedUserDecrypt: (
    params: DelegatedUserDecryptParams,
  ) => Effect.Effect<
    Readonly<Record<Handle, ClearValueType>>,
    DecryptionFailed | RelayerRequestFailed
  >;
  readonly requestZKProofVerification: (
    zkProof: ZKProofLike,
  ) => Effect.Effect<InputProofBytesType, EncryptionFailed>;
  readonly getPublicKey: () => Effect.Effect<{
    publicKeyId: string;
    publicKey: Uint8Array;
  } | null>;
  readonly getPublicParams: (bits: number) => Effect.Effect<{
    publicParams: Uint8Array;
    publicParamsId: string;
  } | null>;
}

export class Relayer extends Context.Tag("Relayer")<Relayer, RelayerService>() {}
