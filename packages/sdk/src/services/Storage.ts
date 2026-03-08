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

export class CredentialStorageConfig extends Context.Tag("CredentialStorageConfig")<
  CredentialStorageConfig,
  GenericStorage
>() {}

export class SessionStorageConfig extends Context.Tag("SessionStorageConfig")<
  SessionStorageConfig,
  GenericStorage
>() {}

export const CredentialStorageLive: Layer.Layer<CredentialStorage, never, CredentialStorageConfig> =
  Layer.effect(
    CredentialStorage,
    Effect.gen(function* () {
      const storage = yield* CredentialStorageConfig;
      return {
        get: (key: string) => Effect.promise(() => storage.get(key)),
        set: (key: string, value: unknown) => Effect.promise(() => storage.set(key, value)),
        delete: (key: string) => Effect.promise(() => storage.delete(key)),
      };
    }),
  );

export const SessionStorageLive: Layer.Layer<SessionStorage, never, SessionStorageConfig> =
  Layer.effect(
    SessionStorage,
    Effect.gen(function* () {
      const storage = yield* SessionStorageConfig;
      return {
        get: (key: string) => Effect.promise(() => storage.get(key)),
        set: (key: string, value: unknown) => Effect.promise(() => storage.set(key, value)),
        delete: (key: string) => Effect.promise(() => storage.delete(key)),
      };
    }),
  );
