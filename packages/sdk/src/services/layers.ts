import { Effect, Layer } from "effect";
import { Relayer } from "./Relayer";
import { Signer } from "./Signer";
import { CredentialStorage, SessionStorage } from "./Storage";
import { EventEmitter } from "./EventEmitter";
import {
  SigningRejected,
  SigningFailed,
  TransactionReverted,
  EncryptionFailed,
  DecryptionFailed,
  RelayerRequestFailed,
} from "../errors";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type { GenericSigner, GenericStorage, ReadContractConfig } from "../token/token.types";
import type { ZamaSDKEventListener } from "../events/sdk-events";

export function makeSignerLayer(signer: GenericSigner): Layer.Layer<Signer> {
  return Layer.succeed(Signer, {
    getAddress: () => Effect.promise(() => signer.getAddress()),
    getChainId: () => Effect.promise(() => signer.getChainId()),
    signTypedData: (data) =>
      Effect.tryPromise({
        try: () => signer.signTypedData(data),
        catch: (e) => {
          const isRejected =
            (e instanceof Error && "code" in e && (e as { code: unknown }).code === 4001) ||
            (e instanceof Error &&
              (e.message.includes("rejected") || e.message.includes("denied")));
          if (isRejected) {
            return new SigningRejected({
              message: "User rejected the signature",
              cause: e instanceof Error ? e : undefined,
            });
          }
          return new SigningFailed({
            message: "Signing failed",
            cause: e instanceof Error ? e : undefined,
          });
        },
      }),
    readContract: <T>(config: ReadContractConfig) =>
      Effect.promise(() => signer.readContract(config) as Promise<T>),
    writeContract: (config) =>
      Effect.tryPromise({
        try: () => signer.writeContract(config),
        catch: (e) =>
          new TransactionReverted({
            message: "Transaction failed",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
    waitForTransactionReceipt: (hash) =>
      Effect.tryPromise({
        try: () => signer.waitForTransactionReceipt(hash),
        catch: (e) =>
          new TransactionReverted({
            message: "Failed to get transaction receipt",
            cause: e instanceof Error ? e : undefined,
          }),
      }),
  });
}

function makeStorageService(storage: GenericStorage) {
  return {
    get: (key: string) => Effect.promise(() => storage.get(key)),
    set: (key: string, value: unknown) => Effect.promise(() => storage.set(key, value)),
    delete: (key: string) => Effect.promise(() => storage.delete(key)),
  };
}

export function makeCredentialStorageLayer(
  storage: GenericStorage,
): Layer.Layer<CredentialStorage> {
  return Layer.succeed(CredentialStorage, makeStorageService(storage));
}

export function makeSessionStorageLayer(storage: GenericStorage): Layer.Layer<SessionStorage> {
  return Layer.succeed(SessionStorage, makeStorageService(storage));
}

export function makeEventEmitterLayer(listener?: ZamaSDKEventListener): Layer.Layer<EventEmitter> {
  return Layer.succeed(EventEmitter, {
    emit: (event) =>
      Effect.sync(() => {
        listener?.({ ...event, timestamp: Date.now() } as never);
      }),
  });
}

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
