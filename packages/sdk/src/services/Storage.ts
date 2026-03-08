import { Context, Effect } from "effect";

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
