# Effect Redesign — Design Document

## Goal

Replace internal SDK composition (promise locks, manual retry, class-based DI) with Effect's Service/Layer system. Public API stays Promise-based — consumers never see Effect.

## Scope

Full SDK internals: Relayer, Credentials, Token, ReadonlyToken, ZamaSDK.
Excluded: TanStack Query integration, contract call builders, worker communication protocol.

## Decisions

- **Approach A**: Effect Services + Layers for DI, scoped resources, typed errors
- **Public API**: Promise-based (C) — Effect is bundled and invisible to consumers
- **Dependency**: `effect` is tree-shaken and inlined via rolldown (not in consumers' node_modules)

## Tagged Errors

Replace `ZamaError` class hierarchy with `Data.TaggedError`:

```ts
class EncryptionFailed extends Data.TaggedError("EncryptionFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class DecryptionFailed extends Data.TaggedError("DecryptionFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class SigningRejected extends Data.TaggedError("SigningRejected")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class SigningFailed extends Data.TaggedError("SigningFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class TransactionReverted extends Data.TaggedError("TransactionReverted")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class ApprovalFailed extends Data.TaggedError("ApprovalFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class RelayerRequestFailed extends Data.TaggedError("RelayerRequestFailed")<{
  readonly message: string;
  readonly statusCode?: number;
  readonly cause?: Error;
}> {}

class NoCiphertext extends Data.TaggedError("NoCiphertext")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class KeypairExpired extends Data.TaggedError("KeypairExpired")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

class ConfigurationError extends Data.TaggedError("ConfigurationError")<{
  readonly message: string;
}> {}
```

Union types:

- `RelayerError = EncryptionFailed | DecryptionFailed | RelayerRequestFailed`
- `TokenError = RelayerError | SigningRejected | SigningFailed | TransactionReverted | ApprovalFailed`

## Services

### Relayer

```ts
class Relayer extends Context.Tag("Relayer")<Relayer, {
  readonly encrypt: (params: EncryptParams) => Effect.Effect<EncryptResult, EncryptionFailed>
  readonly userDecrypt: (params: UserDecryptParams) => Effect.Effect<Record<Handle, ClearValueType>, DecryptionFailed | RelayerRequestFailed>
  readonly publicDecrypt: (handles: Handle[]) => Effect.Effect<PublicDecryptResult, DecryptionFailed>
  readonly generateKeypair: () => Effect.Effect<KeypairType<string>, EncryptionFailed>
  readonly createEIP712: (publicKey: string, contractAddresses: Address[], startTimestamp: number, durationDays?: number) => Effect.Effect<EIP712TypedData, EncryptionFailed>
  readonly createDelegatedUserDecryptEIP712: (...) => Effect.Effect<KmsDelegatedUserDecryptEIP712Type, EncryptionFailed>
  readonly delegatedUserDecrypt: (params: DelegatedUserDecryptParams) => Effect.Effect<Record<Handle, ClearValueType>, DecryptionFailed | RelayerRequestFailed>
  readonly requestZKProofVerification: (zkProof: ZKProofLike) => Effect.Effect<InputProofBytesType, EncryptionFailed>
  readonly getPublicKey: () => Effect.Effect<{ publicKeyId: string; publicKey: Uint8Array } | null>
  readonly getPublicParams: (bits: number) => Effect.Effect<{ publicParams: Uint8Array; publicParamsId: string } | null>
}>() {}
```

### Signer

```ts
class Signer extends Context.Tag("Signer")<
  Signer,
  {
    readonly getAddress: () => Effect.Effect<Address>;
    readonly getChainId: () => Effect.Effect<number>;
    readonly signTypedData: (
      data: EIP712TypedData,
    ) => Effect.Effect<string, SigningRejected | SigningFailed>;
    readonly readContract: <T>(config: ReadContractConfig) => Effect.Effect<T>;
    readonly writeContract: (
      config: WriteContractConfig,
    ) => Effect.Effect<Hex, TransactionReverted>;
    readonly waitForTransactionReceipt: (
      hash: Hex,
    ) => Effect.Effect<TransactionReceipt, TransactionReverted>;
    readonly subscribe?: (callbacks: SignerLifecycleCallbacks) => () => void;
  }
>() {}
```

### Storage + SessionStorage

```ts
class Storage extends Context.Tag("Storage")<
  Storage,
  {
    readonly get: (key: string) => Effect.Effect<unknown>;
    readonly set: (key: string, value: unknown) => Effect.Effect<void>;
    readonly delete: (key: string) => Effect.Effect<void>;
  }
>() {}

class SessionStorage extends Context.Tag("SessionStorage")<
  SessionStorage,
  {
    readonly get: (key: string) => Effect.Effect<unknown>;
    readonly set: (key: string, value: unknown) => Effect.Effect<void>;
    readonly delete: (key: string) => Effect.Effect<void>;
  }
>() {}
```

### EventEmitter

```ts
class EventEmitter extends Context.Tag("EventEmitter")<
  EventEmitter,
  {
    readonly emit: (event: ZamaSDKEventInput) => Effect.Effect<void>;
  }
>() {}
```

## Relayer Layers

### Retry policy (replaces withRetry)

```ts
const retryPolicy = Schedule.exponential("500 millis").pipe(
  Schedule.intersect(Schedule.recurs(2)),
  Schedule.whileInput(isTransientError),
);
```

### RelayerWebLive

Uses `Layer.scoped` + `Effect.acquireRelease` to manage worker lifecycle.
Worker init happens once, finalizer calls `terminate()`.
CSRF refresh happens before each authenticated operation.
All operations use `Effect.retry(retryPolicy)` for transient errors.

### RelayerNodeLive

Same pattern using `NodeWorkerPool` instead of `RelayerWorkerClient`.

### Chain switching

Layer is rebuilt when chainId changes. ZamaSDK detects chain change via signer events and reconstructs the layer graph.

## Credentials as Effect Functions

Replace `CredentialsManager` class with pure Effect functions:

- `allow(...contractAddresses)` — returns `Effect<StoredCredentials, SigningRejected | SigningFailed, Relayer | Signer | Storage | SessionStorage | EventEmitter>`
- `create(contractAddresses)` — generates keypair, creates EIP712, signs
- `isExpired(contractAddress?)` — checks stored credentials
- `revoke(...contractAddresses)` — deletes session entry
- `isAllowed()` — checks session entry existence
- `clear()` — deletes all stored data

AES-GCM helpers remain pure functions (unchanged).

## Token Effects

Each token operation becomes a standalone Effect function in `src/token/effects/`:

- `balanceOf(tokenAddress, owner?)` — `Effect<bigint, DecryptionFailed | ..., Relayer | Signer | Storage | ...>`
- `confidentialTransfer(tokenAddress, to, amount)` — `Effect<TransactionResult, EncryptionFailed | TransactionReverted, ...>`
- `shield(tokenAddress, wrapper, amount, options?)` — multi-step Effect pipeline
- `unshield(tokenAddress, amount)` — orchestrates unwrap + finalize
- `batchDecryptBalances(tokenAddresses, options?)` — uses `Effect.forEach` with concurrency

## Public API Classes

`Token`, `ReadonlyToken`, and `ZamaSDK` remain as public-facing classes.
Each method calls `Effect.runPromise(someEffect.pipe(Effect.provide(this.#layer)))`.
The `#layer` is built in the constructor from config.

## File Structure

```
src/
├── services/
│   ├── Relayer.ts
│   ├── Signer.ts
│   ├── Storage.ts
│   └── EventEmitter.ts
├── relayer/
│   ├── relayer-web.layer.ts
│   ├── relayer-node.layer.ts
│   ├── retry-policy.ts
│   ├── relayer-utils.ts        (unchanged)
│   └── relayer-sdk.types.ts    (unchanged)
├── credentials/
│   ├── allow.ts
│   ├── create.ts
│   ├── crypto.ts               (unchanged)
│   └── validation.ts           (unchanged)
├── token/
│   ├── effects/
│   │   ├── balance.ts
│   │   ├── transfer.ts
│   │   ├── shield.ts
│   │   └── approve.ts
│   ├── Token.ts
│   ├── ReadonlyToken.ts
│   └── ZamaSDK.ts
├── errors.ts
└── index.ts
```

## What gets deleted

- `relayer-web.ts` (class) → replaced by `relayer-web.layer.ts`
- `relayer-node.ts` (class) → replaced by `relayer-node.layer.ts`
- `relayer-sdk.ts` (interface) → replaced by `services/Relayer.ts`
- `credentials-manager.ts` (class) → replaced by `credentials/*.ts`
- `withRetry()` in relayer-utils → replaced by `retry-policy.ts`
- Promise-lock pattern (all instances) → replaced by Layer lifecycle
- `matchZamaError()` → replaced by `Effect.catchTag` / `Effect.catchTags`

## Backward Compatibility

Public API surface is 100% preserved:

- `ZamaSDK`, `Token`, `ReadonlyToken` classes with same constructor configs
- All methods return `Promise<T>` as before
- Error instances change from `ZamaError` subclasses to `Data.TaggedError` instances
  - `instanceof` checks break → document migration: use `error._tag === "EncryptionFailed"` or `matchZamaError` equivalent
  - `.code` field removed → use `._tag` instead
  - This is a **breaking change** for error handling consumers

## Bundle Strategy

- `effect` added as devDependency
- rolldown configured to inline/tree-shake Effect modules into the bundle
- Consumers see zero new dependencies
