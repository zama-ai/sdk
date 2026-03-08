import { Context, Effect, Layer } from "effect";
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
import { EncryptionFailed, DecryptionFailed, RelayerRequestFailed } from "../errors";
import { RelayerSDK } from "../node";

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

export function makeRelayerLayer(relayer: RelayerSDK): Layer.Layer<Relayer> {
  return Layer.succeed(Relayer, {
    encrypt: (params) =>
      Effect.tryPromise({
        try: () => relayer.encrypt(params),
        catch: (e) =>
          new EncryptionFailed({
            message: "Encryption failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    userDecrypt: (params) =>
      Effect.tryPromise({
        try: () => relayer.userDecrypt(params),
        catch: (e) => {
          const statusCode =
            e != null &&
            typeof e === "object" &&
            "statusCode" in e &&
            typeof (e as Record<string, unknown>).statusCode === "number"
              ? ((e as Record<string, unknown>).statusCode as number)
              : undefined;
          if (statusCode !== undefined) {
            return new RelayerRequestFailed({
              message: e instanceof Error ? e.message : "Relayer request failed",
              statusCode,
              cause: e instanceof Error ? e : undefined,
            });
          }
          return new DecryptionFailed({
            message: e instanceof Error ? e.message : "Decryption failed",
            cause: e instanceof Error ? e : undefined,
          });
        },
      }),
    publicDecrypt: (handles) =>
      Effect.tryPromise({
        try: () => relayer.publicDecrypt(handles),
        catch: (e) =>
          new DecryptionFailed({
            message: e instanceof Error ? e.message : "Public decryption failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    generateKeypair: () =>
      Effect.tryPromise({
        try: () => relayer.generateKeypair(),
        catch: (e) =>
          new EncryptionFailed({
            message: "Keypair generation failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    createEIP712: (publicKey, contractAddresses, startTimestamp, durationDays) =>
      Effect.tryPromise({
        try: () => relayer.createEIP712(publicKey, contractAddresses, startTimestamp, durationDays),
        catch: (e) =>
          new EncryptionFailed({
            message: "EIP712 creation failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    createDelegatedUserDecryptEIP712: (
      publicKey,
      contractAddresses,
      delegatorAddress,
      startTimestamp,
      durationDays,
    ) =>
      Effect.tryPromise({
        try: () =>
          relayer.createDelegatedUserDecryptEIP712(
            publicKey,
            contractAddresses,
            delegatorAddress,
            startTimestamp,
            durationDays,
          ),
        catch: (e) =>
          new EncryptionFailed({
            message: "Delegated EIP712 creation failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    delegatedUserDecrypt: (params) =>
      Effect.tryPromise({
        try: () => relayer.delegatedUserDecrypt(params),
        catch: (e) => {
          const statusCode =
            e != null &&
            typeof e === "object" &&
            "statusCode" in e &&
            typeof (e as Record<string, unknown>).statusCode === "number"
              ? ((e as Record<string, unknown>).statusCode as number)
              : undefined;
          if (statusCode !== undefined) {
            return new RelayerRequestFailed({
              message: e instanceof Error ? e.message : "Relayer request failed",
              statusCode,
              cause: e instanceof Error ? e : undefined,
            });
          }
          return new DecryptionFailed({
            message: e instanceof Error ? e.message : "Delegated decryption failed",
            cause: e instanceof Error ? e : undefined,
          });
        },
      }),
    requestZKProofVerification: (zkProof) =>
      Effect.tryPromise({
        try: () => relayer.requestZKProofVerification(zkProof),
        catch: (e) =>
          new EncryptionFailed({
            message: "ZK proof verification failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    getPublicKey: () => Effect.promise(() => relayer.getPublicKey()),
    getPublicParams: (bits) => Effect.promise(() => relayer.getPublicParams(bits)),
  });
}
