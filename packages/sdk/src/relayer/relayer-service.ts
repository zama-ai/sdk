import { Effect } from "effect";
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
} from "./relayer-sdk.types";
import type { RelayerService } from "../services/Relayer";
import { EncryptionFailed, DecryptionFailed, RelayerRequestFailed } from "../errors";
import { buildEIP712DomainType } from "./relayer-utils";
import { WhileTransient } from "./retry-policy";

/**
 * Common backend interface shared by NodeWorkerPool and RelayerWorkerClient.
 * Both implement these methods with identical signatures (inherited from BaseWorkerClient).
 */
export interface RelayerBackend {
  generateKeypair(): Promise<{ publicKey: string; privateKey: string }>;
  createEIP712(params: {
    publicKey: string;
    contractAddresses: Address[];
    startTimestamp: number;
    durationDays: number;
  }): Promise<{
    domain: { name: string; version: string; chainId: number; verifyingContract: string };
    types: { UserDecryptRequestVerification: Array<{ name: string; type: string }> };
    message: {
      publicKey: string;
      contractAddresses: string[];
      startTimestamp: bigint;
      durationDays: bigint;
      extraData: string;
    };
  }>;
  encrypt(params: EncryptParams): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
  userDecrypt(
    params: UserDecryptParams,
  ): Promise<{ clearValues: Readonly<Record<Handle, ClearValueType>> }>;
  publicDecrypt(handles: Handle[]): Promise<{
    clearValues: Readonly<Record<Handle, ClearValueType>>;
    abiEncodedClearValues: string;
    decryptionProof: string;
  }>;
  createDelegatedUserDecryptEIP712(params: {
    publicKey: string;
    contractAddresses: Address[];
    delegatorAddress: string;
    startTimestamp: number;
    durationDays: number;
  }): Promise<KmsDelegatedUserDecryptEIP712Type>;
  delegatedUserDecrypt(
    params: DelegatedUserDecryptParams,
  ): Promise<{ clearValues: Readonly<Record<Handle, ClearValueType>> }>;
  requestZKProofVerification(zkProof: ZKProofLike): Promise<InputProofBytesType>;
  getPublicKey(): Promise<{
    result: { publicKeyId: string; publicKey: Uint8Array } | null;
  }>;
  getPublicParams(
    bits: number,
  ): Promise<{ result: { publicParams: Uint8Array; publicParamsId: string } | null }>;
}

/**
 * Build a RelayerService from a backend (NodeWorkerPool or RelayerWorkerClient).
 *
 * Shared between the `*Live` Effect layers and the imperative `RelayerNode`/`RelayerWeb` classes
 * to avoid duplicating the Effect-based service implementation.
 *
 * @param backend - Worker pool or client that implements the FHE operations.
 * @param beforeOp - Optional Effect to run before retryable operations (e.g. CSRF refresh).
 */
export function buildRelayerService(
  backend: RelayerBackend,
  beforeOp?: () => Effect.Effect<void>,
): RelayerService {
  const withBeforeOp = <A, E>(effect: Effect.Effect<A, E>): Effect.Effect<A, E> => {
    if (!beforeOp) return effect;
    return Effect.gen(function* () {
      yield* beforeOp();
      return yield* effect;
    });
  };

  return {
    encrypt: (params: EncryptParams): Effect.Effect<EncryptResult, EncryptionFailed> =>
      withBeforeOp(
        Effect.tryPromise({
          try: async () => {
            const result = await backend.encrypt(params);
            return { handles: result.handles, inputProof: result.inputProof };
          },
          catch: (error) =>
            new EncryptionFailed({
              message: "Encryption failed",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
      ).pipe(Effect.retry(WhileTransient)),

    userDecrypt: (
      params: UserDecryptParams,
    ): Effect.Effect<
      Readonly<Record<Handle, ClearValueType>>,
      DecryptionFailed | RelayerRequestFailed
    > =>
      withBeforeOp(
        Effect.tryPromise({
          try: async () => {
            const result = await backend.userDecrypt(params);
            return result.clearValues;
          },
          catch: (error) =>
            new DecryptionFailed({
              message: "User decryption failed",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
      ).pipe(Effect.retry(WhileTransient)),

    publicDecrypt: (handles: Handle[]): Effect.Effect<PublicDecryptResult, DecryptionFailed> =>
      withBeforeOp(
        Effect.tryPromise({
          try: async () => {
            const result = await backend.publicDecrypt(handles);
            return {
              clearValues: result.clearValues,
              abiEncodedClearValues: result.abiEncodedClearValues as `0x${string}`,
              decryptionProof: result.decryptionProof as `0x${string}`,
            };
          },
          catch: (error) =>
            new DecryptionFailed({
              message: "Public decryption failed",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
      ).pipe(Effect.retry(WhileTransient)),

    generateKeypair: (): Effect.Effect<KeypairType<string>, EncryptionFailed> =>
      Effect.tryPromise({
        try: async () => {
          const result = await backend.generateKeypair();
          return { publicKey: result.publicKey, privateKey: result.privateKey };
        },
        catch: (error) =>
          new EncryptionFailed({
            message: "Keypair generation failed",
            cause: error instanceof Error ? error : undefined,
          }),
      }),

    createEIP712: (
      publicKey: string,
      contractAddresses: Address[],
      startTimestamp: number,
      durationDays: number = 7,
    ): Effect.Effect<EIP712TypedData, EncryptionFailed> =>
      Effect.tryPromise({
        try: async () => {
          const result = await backend.createEIP712({
            publicKey,
            contractAddresses,
            startTimestamp,
            durationDays,
          });

          const domain = {
            name: result.domain.name,
            version: result.domain.version,
            chainId: result.domain.chainId,
            verifyingContract: result.domain.verifyingContract as `0x${string}`,
          };

          return {
            domain,
            types: {
              EIP712Domain: buildEIP712DomainType(domain),
              UserDecryptRequestVerification: result.types.UserDecryptRequestVerification,
            },
            message: {
              publicKey: result.message.publicKey,
              contractAddresses: result.message.contractAddresses,
              startTimestamp: result.message.startTimestamp,
              durationDays: result.message.durationDays,
              extraData: result.message.extraData,
            },
          };
        },
        catch: (error) =>
          new EncryptionFailed({
            message: "EIP712 creation failed",
            cause: error instanceof Error ? error : undefined,
          }),
      }),

    createDelegatedUserDecryptEIP712: (
      publicKey: string,
      contractAddresses: Address[],
      delegatorAddress: string,
      startTimestamp: number,
      durationDays: number = 7,
    ): Effect.Effect<KmsDelegatedUserDecryptEIP712Type, EncryptionFailed> =>
      Effect.tryPromise({
        try: () =>
          backend.createDelegatedUserDecryptEIP712({
            publicKey,
            contractAddresses,
            delegatorAddress,
            startTimestamp,
            durationDays,
          }),
        catch: (error) =>
          new EncryptionFailed({
            message: "Delegated EIP712 creation failed",
            cause: error instanceof Error ? error : undefined,
          }),
      }),

    delegatedUserDecrypt: (
      params: DelegatedUserDecryptParams,
    ): Effect.Effect<
      Readonly<Record<Handle, ClearValueType>>,
      DecryptionFailed | RelayerRequestFailed
    > =>
      withBeforeOp(
        Effect.tryPromise({
          try: async () => {
            const result = await backend.delegatedUserDecrypt(params);
            return result.clearValues;
          },
          catch: (error) =>
            new DecryptionFailed({
              message: "Delegated user decryption failed",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
      ).pipe(Effect.retry(WhileTransient)),

    requestZKProofVerification: (
      zkProof: ZKProofLike,
    ): Effect.Effect<InputProofBytesType, EncryptionFailed> =>
      withBeforeOp(
        Effect.tryPromise({
          try: () => backend.requestZKProofVerification(zkProof),
          catch: (error) =>
            new EncryptionFailed({
              message: "ZK proof verification failed",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
      ).pipe(Effect.retry(WhileTransient)),

    getPublicKey: (): Effect.Effect<{
      publicKeyId: string;
      publicKey: Uint8Array;
    } | null> =>
      Effect.tryPromise(async () => (await backend.getPublicKey()).result).pipe(Effect.orDie),

    getPublicParams: (
      bits: number,
    ): Effect.Effect<{
      publicParams: Uint8Array;
      publicParamsId: string;
    } | null> =>
      Effect.tryPromise(async () => (await backend.getPublicParams(bits)).result).pipe(
        Effect.orDie,
      ),
  };
}
