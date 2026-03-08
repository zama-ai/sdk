import { Context, Effect, Layer } from "effect";
import type { GenericStorage } from "../token/token.types";

export interface StorageService {
  readonly get: (key: string) => Effect.Effect<unknown>;
  readonly set: (key: string, value: unknown) => Effect.Effect<void>;
  readonly delete: (key: string) => Effect.Effect<void>;
}

export class CredentialStorage extends Context.Tag("CredentialStorage")<
  CredentialStorage,
  StorageService
>() {}

export class SessionStorage extends Context.Tag("SessionStorage")<
  SessionStorage,
  StorageService
>() {}

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
