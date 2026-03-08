import { Effect, Layer } from "effect";
import { Signer } from "./Signer";
import { CredentialStorage, SessionStorage } from "./Storage";
import { EventEmitter } from "./EventEmitter";
import { SigningRejected, SigningFailed, TransactionReverted } from "../errors";
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
