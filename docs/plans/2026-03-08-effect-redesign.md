# Effect Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace internal SDK composition (promise locks, manual retry, class-based DI) with Effect's Service/Layer system while keeping the public Promise-based API unchanged.

**Architecture:** Effect Services for Relayer, Signer, Storage, and EventEmitter. Layer.scoped + acquireRelease for worker lifecycle. Pure Effect functions for credentials and token operations. Thin public classes wrap effects with Effect.runPromise.

**Tech Stack:** effect, rolldown (bundling/tree-shaking), vitest

---

### Task 1: Install Effect and Configure Build

**Files:**

- Modify: `packages/sdk/package.json`
- Modify: `packages/sdk/rolldown.config.ts`

**Step 1: Install effect as a dependency**

Run: `cd /Users/guillaume.hermet/Documents/zama/token-sdk && pnpm add effect -w --filter @zama-fhe/sdk`
Expected: effect added to packages/sdk/package.json dependencies

**Step 2: Verify effect is NOT in externals (so rolldown bundles it)**

Read `packages/sdk/rolldown.config.ts` and confirm `effect` is **not** listed in the `external` array. If it is, remove it. The current externals are: `viem`, `ethers`, `@zama-fhe/relayer-sdk`, `@tanstack/query-core`, `node:*`. Effect should NOT be added here — it must be bundled/tree-shaken into the output.

**Step 3: Verify build works**

Run: `cd packages/sdk && pnpm build`
Expected: Build succeeds, `dist/` output includes inlined effect code

**Step 4: Verify tests still pass**

Run: `pnpm test:run`
Expected: All existing tests pass (no changes to source yet)

**Step 5: Commit**

```
feat: add effect dependency for internal SDK composition
```

---

### Task 2: Tagged Errors

**Files:**

- Create: `packages/sdk/src/errors.ts`
- Test: `packages/sdk/src/__tests__/errors.test.ts`

**Step 1: Write the failing test**

Create `packages/sdk/src/__tests__/errors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  EncryptionFailed,
  DecryptionFailed,
  SigningRejected,
  SigningFailed,
  TransactionReverted,
  ApprovalFailed,
  RelayerRequestFailed,
  NoCiphertext,
  KeypairExpired,
  InvalidKeypair,
  ConfigurationFailed,
} from "../errors";

describe("Tagged Errors", () => {
  it("EncryptionFailed has correct _tag", () => {
    const error = new EncryptionFailed({ message: "boom" });
    expect(error._tag).toBe("EncryptionFailed");
    expect(error.message).toBe("boom");
  });

  it("DecryptionFailed has correct _tag", () => {
    const error = new DecryptionFailed({ message: "decrypt boom" });
    expect(error._tag).toBe("DecryptionFailed");
    expect(error.message).toBe("decrypt boom");
  });

  it("SigningRejected has correct _tag", () => {
    const error = new SigningRejected({ message: "user rejected" });
    expect(error._tag).toBe("SigningRejected");
  });

  it("SigningFailed has correct _tag", () => {
    const error = new SigningFailed({ message: "sign failed" });
    expect(error._tag).toBe("SigningFailed");
  });

  it("TransactionReverted has correct _tag", () => {
    const error = new TransactionReverted({ message: "reverted" });
    expect(error._tag).toBe("TransactionReverted");
  });

  it("ApprovalFailed has correct _tag", () => {
    const error = new ApprovalFailed({ message: "approval boom" });
    expect(error._tag).toBe("ApprovalFailed");
  });

  it("RelayerRequestFailed includes statusCode", () => {
    const error = new RelayerRequestFailed({ message: "502", statusCode: 502 });
    expect(error._tag).toBe("RelayerRequestFailed");
    expect(error.statusCode).toBe(502);
  });

  it("NoCiphertext has correct _tag", () => {
    const error = new NoCiphertext({ message: "no ct" });
    expect(error._tag).toBe("NoCiphertext");
  });

  it("KeypairExpired has correct _tag", () => {
    const error = new KeypairExpired({ message: "expired" });
    expect(error._tag).toBe("KeypairExpired");
  });

  it("InvalidKeypair has correct _tag", () => {
    const error = new InvalidKeypair({ message: "invalid" });
    expect(error._tag).toBe("InvalidKeypair");
  });

  it("ConfigurationFailed has correct _tag", () => {
    const error = new ConfigurationFailed({ message: "bad config" });
    expect(error._tag).toBe("ConfigurationFailed");
  });

  it("errors are instances of Error", () => {
    const error = new EncryptionFailed({ message: "boom" });
    expect(error).toBeInstanceOf(Error);
  });

  it("errors carry cause", () => {
    const cause = new Error("root");
    const error = new EncryptionFailed({ message: "boom", cause });
    expect(error.cause).toBe(cause);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/__tests__/errors.test.ts`
Expected: FAIL — cannot resolve `../errors`

**Step 3: Write the implementation**

Create `packages/sdk/src/errors.ts`:

```ts
import { Data } from "effect";

export class EncryptionFailed extends Data.TaggedError("EncryptionFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class DecryptionFailed extends Data.TaggedError("DecryptionFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class SigningRejected extends Data.TaggedError("SigningRejected")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class SigningFailed extends Data.TaggedError("SigningFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class TransactionReverted extends Data.TaggedError("TransactionReverted")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class ApprovalFailed extends Data.TaggedError("ApprovalFailed")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class RelayerRequestFailed extends Data.TaggedError("RelayerRequestFailed")<{
  readonly message: string;
  readonly statusCode?: number;
  readonly cause?: Error;
}> {}

export class NoCiphertext extends Data.TaggedError("NoCiphertext")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class KeypairExpired extends Data.TaggedError("KeypairExpired")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class InvalidKeypair extends Data.TaggedError("InvalidKeypair")<{
  readonly message: string;
  readonly cause?: Error;
}> {}

export class ConfigurationFailed extends Data.TaggedError("ConfigurationFailed")<{
  readonly message: string;
}> {}

/** All errors that can originate from the relayer layer. */
export type RelayerError = EncryptionFailed | DecryptionFailed | RelayerRequestFailed;

/** All errors that can originate from token operations. */
export type TokenError =
  | RelayerError
  | SigningRejected
  | SigningFailed
  | TransactionReverted
  | ApprovalFailed
  | NoCiphertext
  | KeypairExpired
  | InvalidKeypair;
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/sdk/src/__tests__/errors.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add Effect tagged errors
```

---

### Task 3: Effect Service Definitions

**Files:**

- Create: `packages/sdk/src/services/Relayer.ts`
- Create: `packages/sdk/src/services/Signer.ts`
- Create: `packages/sdk/src/services/Storage.ts`
- Create: `packages/sdk/src/services/EventEmitter.ts`
- Create: `packages/sdk/src/services/index.ts`
- Test: `packages/sdk/src/services/__tests__/services.test.ts`

**Step 1: Write the failing test**

Create `packages/sdk/src/services/__tests__/services.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Effect, Context } from "effect";
import { Relayer, Signer, CredentialStorage, SessionStorage, EventEmitter } from "../index";

describe("Service Tags", () => {
  it("Relayer is a valid Context.Tag", () => {
    // Verify we can build an Effect that requires Relayer
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return relayer;
    });
    // The effect type should require Relayer in its context
    expect(program).toBeDefined();
  });

  it("Signer is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const signer = yield* Signer;
      return signer;
    });
    expect(program).toBeDefined();
  });

  it("CredentialStorage is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const storage = yield* CredentialStorage;
      return storage;
    });
    expect(program).toBeDefined();
  });

  it("SessionStorage is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const storage = yield* SessionStorage;
      return storage;
    });
    expect(program).toBeDefined();
  });

  it("EventEmitter is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const emitter = yield* EventEmitter;
      return emitter;
    });
    expect(program).toBeDefined();
  });

  it("Relayer service can be provided and used", async () => {
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      const result = yield* relayer.generateKeypair();
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provideService(Relayer, {
          encrypt: () => Effect.succeed({ handles: [], inputProof: new Uint8Array() }),
          userDecrypt: () => Effect.succeed({}),
          publicDecrypt: () =>
            Effect.succeed({ clearValues: {}, abiEncodedClearValues: "0x", decryptionProof: "0x" }),
          generateKeypair: () => Effect.succeed({ publicKey: "pk", privateKey: "sk" }),
          createEIP712: () => Effect.die("not implemented"),
          createDelegatedUserDecryptEIP712: () => Effect.die("not implemented"),
          delegatedUserDecrypt: () => Effect.succeed({}),
          requestZKProofVerification: () => Effect.die("not implemented"),
          getPublicKey: () => Effect.succeed(null),
          getPublicParams: () => Effect.succeed(null),
        }),
      ),
    );

    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/services/__tests__/services.test.ts`
Expected: FAIL — cannot resolve `../index`

**Step 3: Write the service definitions**

Create `packages/sdk/src/services/Relayer.ts`:

```ts
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
```

Create `packages/sdk/src/services/Signer.ts`:

```ts
import { Context, Effect } from "effect";
import type { Address, EIP712TypedData, Hex } from "../relayer/relayer-sdk.types";
import type {
  ReadContractConfig,
  WriteContractConfig,
  TransactionReceipt,
} from "../token/token.types";
import type { SigningRejected, SigningFailed, TransactionReverted } from "../errors";

export interface SignerService {
  readonly getAddress: () => Effect.Effect<Address>;
  readonly getChainId: () => Effect.Effect<number>;
  readonly signTypedData: (
    data: EIP712TypedData,
  ) => Effect.Effect<string, SigningRejected | SigningFailed>;
  readonly readContract: <T>(config: ReadContractConfig) => Effect.Effect<T>;
  readonly writeContract: (config: WriteContractConfig) => Effect.Effect<Hex, TransactionReverted>;
  readonly waitForTransactionReceipt: (
    hash: Hex,
  ) => Effect.Effect<TransactionReceipt, TransactionReverted>;
}

export class Signer extends Context.Tag("Signer")<Signer, SignerService>() {}
```

Create `packages/sdk/src/services/Storage.ts`:

```ts
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
```

Create `packages/sdk/src/services/EventEmitter.ts`:

```ts
import { Context, Effect } from "effect";
import type { ZamaSDKEventInput } from "../events/sdk-events";

export interface EventEmitterService {
  readonly emit: (event: ZamaSDKEventInput) => Effect.Effect<void>;
}

export class EventEmitter extends Context.Tag("EventEmitter")<
  EventEmitter,
  EventEmitterService
>() {}
```

Create `packages/sdk/src/services/index.ts`:

```ts
export { Relayer, type RelayerService } from "./Relayer";
export { Signer, type SignerService } from "./Signer";
export { CredentialStorage, SessionStorage, type StorageService } from "./Storage";
export { EventEmitter, type EventEmitterService } from "./EventEmitter";
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/sdk/src/services/__tests__/services.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add Effect service definitions for Relayer, Signer, Storage, EventEmitter
```

---

### Task 4: Retry Policy

**Files:**

- Create: `packages/sdk/src/relayer/retry-policy.ts`
- Test: `packages/sdk/src/relayer/__tests__/retry-policy.test.ts`

**Step 1: Write the failing test**

Create `packages/sdk/src/relayer/__tests__/retry-policy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { retryTransient } from "../retry-policy";
import { EncryptionFailed } from "../../errors";

describe("retryTransient", () => {
  it("succeeds on first attempt", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.sync(() => {
        attempts++;
        return "ok";
      }),
    );
    const result = await Effect.runPromise(program);
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
  });

  it("retries on transient error and succeeds", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.suspend(() => {
        attempts++;
        if (attempts < 2) {
          return Effect.fail(new EncryptionFailed({ message: "timed out" }));
        }
        return Effect.succeed("ok");
      }),
    );
    const result = await Effect.runPromise(program);
    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry non-transient errors", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.suspend(() => {
        attempts++;
        return Effect.fail(new EncryptionFailed({ message: "user error" }));
      }),
    );
    await expect(Effect.runPromise(program)).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it("gives up after max retries", async () => {
    let attempts = 0;
    const program = retryTransient(
      Effect.suspend(() => {
        attempts++;
        return Effect.fail(new EncryptionFailed({ message: "timeout forever" }));
      }),
    );
    await expect(Effect.runPromise(program)).rejects.toThrow();
    expect(attempts).toBe(3); // 1 initial + 2 retries
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/retry-policy.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `packages/sdk/src/relayer/retry-policy.ts`:

```ts
import { Effect, Schedule } from "effect";

/**
 * Check if an error message indicates a transient/retriable failure.
 * Matches the same patterns as the old `isTransientError` in relayer-utils.ts.
 */
function isTransient(error: unknown): boolean {
  if (
    !(error instanceof Error) &&
    !(error != null && typeof error === "object" && "message" in error)
  ) {
    return false;
  }
  const msg = (error as { message: string }).message.toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("socket hang up") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504")
  );
}

const transientSchedule = Schedule.exponential("500 millis").pipe(
  Schedule.intersect(Schedule.recurs(2)),
);

/**
 * Wrap an effect with transient-error retry logic.
 * Retries up to 2 times with exponential backoff, but only for transient errors.
 * Non-transient errors fail immediately.
 */
export function retryTransient<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return effect.pipe(
    Effect.retry(transientSchedule.pipe(Schedule.whileInput((error: E) => isTransient(error)))),
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/retry-policy.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add Effect retry policy for transient errors
```

---

### Task 5: RelayerWeb Layer

**Files:**

- Create: `packages/sdk/src/relayer/relayer-web.layer.ts`
- Test: `packages/sdk/src/relayer/__tests__/relayer-web.layer.test.ts`

**Step 1: Write the failing test**

Create `packages/sdk/src/relayer/__tests__/relayer-web.layer.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Effect, Layer } from "effect";
import { Relayer } from "../../services";
import { makeRelayerWebLayer } from "../relayer-web.layer";
import type { RelayerWebConfig } from "../relayer-sdk.types";

// Mock the worker client module
vi.mock("../../worker/worker.client", () => ({
  RelayerWorkerClient: vi.fn().mockImplementation(() => ({
    initWorker: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn(),
    generateKeypair: vi.fn().mockResolvedValue({ publicKey: "pk", privateKey: "sk" }),
    createEIP712: vi.fn().mockResolvedValue({
      domain: { name: "test", version: "1", chainId: 1, verifyingContract: "0x00" },
      types: { UserDecryptRequestVerification: [] },
      message: {
        publicKey: "pk",
        contractAddresses: [],
        startTimestamp: 1000n,
        durationDays: 1n,
        extraData: "0x",
      },
    }),
    encrypt: vi.fn().mockResolvedValue({
      handles: [new Uint8Array([1])],
      inputProof: new Uint8Array([2]),
    }),
    userDecrypt: vi.fn().mockResolvedValue({ clearValues: { "0xhandle": 100n } }),
    publicDecrypt: vi.fn().mockResolvedValue({
      clearValues: {},
      abiEncodedClearValues: "0x",
      decryptionProof: "0xproof",
    }),
    updateCsrf: vi.fn(),
    createDelegatedUserDecryptEIP712: vi.fn(),
    delegatedUserDecrypt: vi.fn().mockResolvedValue({ clearValues: {} }),
    requestZKProofVerification: vi.fn(),
    getPublicKey: vi.fn().mockResolvedValue({ result: null }),
    getPublicParams: vi.fn().mockResolvedValue({ result: null }),
  })),
}));

function makeTestConfig(): RelayerWebConfig {
  return {
    transports: { 1: {} },
    getChainId: () => Promise.resolve(1),
  };
}

describe("RelayerWebLayer", () => {
  it("provides a working Relayer service", async () => {
    const config = makeTestConfig();
    const layer = makeRelayerWebLayer(config);

    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return yield* relayer.generateKeypair();
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
  });

  it("encrypt returns handles and inputProof", async () => {
    const config = makeTestConfig();
    const layer = makeRelayerWebLayer(config);

    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return yield* relayer.encrypt({
        values: [{ value: 100n, type: "euint64" }],
        contractAddress: "0x1111111111111111111111111111111111111111",
        userAddress: "0x2222222222222222222222222222222222222222",
      });
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result.handles).toHaveLength(1);
    expect(result.inputProof).toBeDefined();
  });

  it("userDecrypt returns clearValues", async () => {
    const config = makeTestConfig();
    const layer = makeRelayerWebLayer(config);

    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return yield* relayer.userDecrypt({
        handles: ["0xhandle"],
        contractAddress: "0x1111111111111111111111111111111111111111",
        signedContractAddresses: [],
        privateKey: "sk",
        publicKey: "pk",
        signature: "sig",
        signerAddress: "0x2222222222222222222222222222222222222222",
        startTimestamp: 1000,
        durationDays: 1,
      });
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toEqual({ "0xhandle": 100n });
  });

  it("terminates worker on scope close", async () => {
    const { RelayerWorkerClient } = await import("../../worker/worker.client");
    const config = makeTestConfig();
    const layer = makeRelayerWebLayer(config);

    // Run a scoped program — the layer's finalizer fires on scope close
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      yield* relayer.generateKeypair();
    });

    await Effect.runPromise(Effect.scoped(program.pipe(Effect.provide(layer))));

    // The mocked client's terminate should have been called
    const mockInstance = vi.mocked(RelayerWorkerClient).mock.results[0]?.value;
    expect(mockInstance?.terminate).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/relayer-web.layer.test.ts`
Expected: FAIL — cannot resolve `../relayer-web.layer`

**Step 3: Write the implementation**

Create `packages/sdk/src/relayer/relayer-web.layer.ts`:

```ts
import { Effect, Layer } from "effect";
import { Relayer } from "../services";
import { EncryptionFailed, DecryptionFailed, RelayerRequestFailed } from "../errors";
import { RelayerWorkerClient, type WorkerClientConfig } from "../worker/worker.client";
import { buildEIP712DomainType, mergeFhevmConfig } from "./relayer-utils";
import { retryTransient } from "./retry-policy";
import type { RelayerWebConfig } from "./relayer-sdk.types";

const RELAYER_SDK_VERSION = "0.4.1";
const CDN_URL = `https://cdn.zama.org/relayer-sdk-js/${RELAYER_SDK_VERSION}/relayer-sdk-js.umd.cjs`;
const CDN_INTEGRITY =
  "2bd5401738b74509549bed2029bbbabedd481b10ac260f66e64a4ff3723d6d704180c51e882757c56ca1840491e90e33";

function buildWorkerConfig(config: RelayerWebConfig, chainId: number): WorkerClientConfig {
  const { transports, security, threads } = config;

  if (threads !== undefined && (!Number.isInteger(threads) || threads < 1)) {
    throw new Error(`Invalid thread count: ${threads}. Must be a positive integer.`);
  }

  if (threads !== undefined && typeof globalThis.SharedArrayBuffer === "undefined") {
    config.logger?.warn(
      "threads option requires SharedArrayBuffer (COOP/COEP headers). Falling back to single-threaded.",
    );
  }

  return {
    cdnUrl: CDN_URL,
    fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
    csrfToken: security?.getCsrfToken?.() ?? "",
    integrity: security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
    logger: config.logger,
    thread: threads,
  };
}

function wrapDecryptError(e: unknown) {
  if (e != null && typeof e === "object" && "statusCode" in e) {
    const statusCode = (e as { statusCode: number }).statusCode;
    if (statusCode === 400) {
      return new DecryptionFailed({
        message: e instanceof Error ? e.message : "No ciphertext for this account",
        cause: e instanceof Error ? e : undefined,
      });
    }
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
}

export function makeRelayerWebLayer(
  config: RelayerWebConfig,
): Layer.Layer<Relayer, EncryptionFailed> {
  return Layer.scoped(
    Relayer,
    Effect.gen(function* () {
      const chainId = yield* Effect.promise(() => config.getChainId());
      const workerConfig = buildWorkerConfig(config, chainId);

      // Acquire worker, register finalizer
      const client = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const c = new RelayerWorkerClient(workerConfig);
          yield* Effect.promise(() => c.initWorker());
          config.onStatusChange?.("ready");
          return c;
        }).pipe(
          Effect.mapError(
            (e) =>
              new EncryptionFailed({
                message: "Failed to initialize FHE worker",
                cause: e instanceof Error ? e : undefined,
              }),
          ),
        ),
        (c) => Effect.sync(() => c.terminate()),
      );

      const refreshCsrf = Effect.promise(async () => {
        const token = config.security?.getCsrfToken?.() ?? "";
        if (token) await client.updateCsrf(token);
      });

      return {
        encrypt: (params) =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf;
              const result = yield* Effect.tryPromise({
                try: () => client.encrypt(params),
                catch: (e) =>
                  new EncryptionFailed({
                    message: "Encryption failed",
                    cause: e instanceof Error ? e : undefined,
                  }),
              });
              return { handles: result.handles, inputProof: result.inputProof };
            }),
          ),

        userDecrypt: (params) =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf;
              const result = yield* Effect.tryPromise({
                try: () => client.userDecrypt(params),
                catch: (e) => wrapDecryptError(e),
              });
              return result.clearValues;
            }),
          ),

        publicDecrypt: (handles) =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf;
              const result = yield* Effect.tryPromise({
                try: () => client.publicDecrypt(handles),
                catch: (e) =>
                  new DecryptionFailed({
                    message: "Public decryption failed",
                    cause: e instanceof Error ? e : undefined,
                  }),
              });
              return {
                clearValues: result.clearValues,
                abiEncodedClearValues: result.abiEncodedClearValues,
                decryptionProof: result.decryptionProof,
              };
            }),
          ),

        generateKeypair: () =>
          Effect.tryPromise({
            try: () => client.generateKeypair(),
            catch: (e) =>
              new EncryptionFailed({
                message: "Keypair generation failed",
                cause: e instanceof Error ? e : undefined,
              }),
          }).pipe(Effect.map((r) => ({ publicKey: r.publicKey, privateKey: r.privateKey }))),

        createEIP712: (publicKey, contractAddresses, startTimestamp, durationDays = 7) =>
          Effect.tryPromise({
            try: () =>
              client.createEIP712({ publicKey, contractAddresses, startTimestamp, durationDays }),
            catch: (e) =>
              new EncryptionFailed({
                message: "EIP712 creation failed",
                cause: e instanceof Error ? e : undefined,
              }),
          }).pipe(
            Effect.map((result) => {
              const domain = {
                name: result.domain.name,
                version: result.domain.version,
                chainId: result.domain.chainId,
                verifyingContract: result.domain.verifyingContract,
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
            }),
          ),

        createDelegatedUserDecryptEIP712: (
          publicKey,
          contractAddresses,
          delegatorAddress,
          startTimestamp,
          durationDays = 7,
        ) =>
          Effect.tryPromise({
            try: () =>
              client.createDelegatedUserDecryptEIP712({
                publicKey,
                contractAddresses,
                delegatorAddress,
                startTimestamp,
                durationDays,
              }),
            catch: (e) =>
              new EncryptionFailed({
                message: "Delegated EIP712 creation failed",
                cause: e instanceof Error ? e : undefined,
              }),
          }),

        delegatedUserDecrypt: (params) =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf;
              const result = yield* Effect.tryPromise({
                try: () => client.delegatedUserDecrypt(params),
                catch: (e) => wrapDecryptError(e),
              });
              return result.clearValues;
            }),
          ),

        requestZKProofVerification: (zkProof) =>
          retryTransient(
            Effect.gen(function* () {
              yield* refreshCsrf;
              return yield* Effect.tryPromise({
                try: () => client.requestZKProofVerification(zkProof),
                catch: (e) =>
                  new EncryptionFailed({
                    message: "ZK proof verification failed",
                    cause: e instanceof Error ? e : undefined,
                  }),
              });
            }),
          ),

        getPublicKey: () =>
          Effect.tryPromise(() => client.getPublicKey()).pipe(
            Effect.map((r) => r.result),
            Effect.orDie,
          ),

        getPublicParams: (bits) =>
          Effect.tryPromise(() => client.getPublicParams(bits)).pipe(
            Effect.map((r) => r.result),
            Effect.orDie,
          ),
      };
    }),
  );
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/sdk/src/relayer/__tests__/relayer-web.layer.test.ts`
Expected: PASS

**Step 5: Commit**

```
feat: add RelayerWeb Effect layer with scoped resource management
```

---

### Task 6: RelayerNode Layer

**Files:**

- Create: `packages/sdk/src/relayer/relayer-node.layer.ts`
- Test: `packages/sdk/src/relayer/__tests__/relayer-node.layer.test.ts`

Follows the same pattern as Task 5 but uses `NodeWorkerPool` instead of `RelayerWorkerClient`. Mock `../../worker/worker.node-pool` in tests. The implementation mirrors `relayer-web.layer.ts` with pool config instead of worker config, and no CSRF logic.

**Step 1: Write the failing test** — same structure as Task 5 but with `makeRelayerNodeLayer` and `NodeWorkerPool` mock.

**Step 2: Run test to verify it fails**

**Step 3: Write the implementation** — `packages/sdk/src/relayer/relayer-node.layer.ts` exporting `makeRelayerNodeLayer(config: RelayerNodeConfig): Layer.Layer<Relayer, EncryptionFailed>`

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```
feat: add RelayerNode Effect layer with pool lifecycle
```

---

### Task 7: Signer and Storage Layer Factories

**Files:**

- Create: `packages/sdk/src/services/layers.ts`
- Test: `packages/sdk/src/services/__tests__/layers.test.ts`

**Step 1: Write the failing test**

Create `packages/sdk/src/services/__tests__/layers.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { Effect } from "effect";
import { Signer, CredentialStorage, SessionStorage, EventEmitter } from "../index";
import {
  makeSignerLayer,
  makeCredentialStorageLayer,
  makeSessionStorageLayer,
  makeEventEmitterLayer,
} from "../layers";
import type { GenericSigner, GenericStorage } from "../../token/token.types";
import { MemoryStorage } from "../../token/memory-storage";

describe("Layer factories", () => {
  it("makeSignerLayer wraps GenericSigner into Signer service", async () => {
    const mockSigner: GenericSigner = {
      getAddress: vi.fn().mockResolvedValue("0xaddr"),
      getChainId: vi.fn().mockResolvedValue(1),
      signTypedData: vi.fn().mockResolvedValue("0xsig"),
      readContract: vi.fn().mockResolvedValue("data"),
      writeContract: vi.fn().mockResolvedValue("0xtx"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    };

    const layer = makeSignerLayer(mockSigner);
    const program = Effect.gen(function* () {
      const signer = yield* Signer;
      return yield* signer.getAddress();
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toBe("0xaddr");
  });

  it("makeCredentialStorageLayer wraps GenericStorage", async () => {
    const store = new MemoryStorage();
    const layer = makeCredentialStorageLayer(store);
    const program = Effect.gen(function* () {
      const storage = yield* CredentialStorage;
      yield* storage.set("key", "value");
      return yield* storage.get("key");
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toBe("value");
  });

  it("makeEventEmitterLayer calls listener", async () => {
    const listener = vi.fn();
    const layer = makeEventEmitterLayer(listener);
    const program = Effect.gen(function* () {
      const emitter = yield* EventEmitter;
      yield* emitter.emit({ type: "test" } as never);
    });

    await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(listener).toHaveBeenCalledOnce();
  });
});
```

**Step 2: Run test to verify it fails**

**Step 3: Write the implementation**

Create `packages/sdk/src/services/layers.ts`:

```ts
import { Effect, Layer } from "effect";
import { Signer } from "./Signer";
import { CredentialStorage, SessionStorage } from "./Storage";
import { EventEmitter } from "./EventEmitter";
import { SigningRejected, SigningFailed, TransactionReverted } from "../errors";
import type { GenericSigner, GenericStorage } from "../token/token.types";
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
    readContract: (config) => Effect.promise(() => signer.readContract(config)),
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
```

**Step 4: Run test to verify it passes**

**Step 5: Commit**

```
feat: add layer factories for Signer, Storage, and EventEmitter
```

---

### Task 8: Credentials Effect Functions

**Files:**

- Create: `packages/sdk/src/credentials/allow.ts`
- Create: `packages/sdk/src/credentials/create.ts`
- Create: `packages/sdk/src/credentials/crypto.ts`
- Create: `packages/sdk/src/credentials/index.ts`
- Test: `packages/sdk/src/credentials/__tests__/credentials.test.ts`

This is the largest task. Port `CredentialsManager` to pure Effect functions using the Relayer, Signer, CredentialStorage, SessionStorage, and EventEmitter services. Keep the AES-GCM crypto helpers as pure async functions (wrapped with `Effect.promise`). The `allow()` function implements the same cache-check → re-sign → create-new flow as the current class.

**Step 1: Write failing tests** covering:

- `allow()` returns cached credentials when valid
- `allow()` creates fresh credentials when none exist
- `allow()` re-signs when session expired but keypair still valid
- `create()` generates keypair, creates EIP712, signs, stores
- `create()` wraps rejection as SigningRejected

**Step 2-5: Implement, verify, commit**

```
feat: port CredentialsManager to Effect functions
```

---

### Task 9: Token Effect Functions

**Files:**

- Create: `packages/sdk/src/token/effects/balance.ts`
- Create: `packages/sdk/src/token/effects/transfer.ts`
- Create: `packages/sdk/src/token/effects/shield.ts`
- Create: `packages/sdk/src/token/effects/approve.ts`
- Create: `packages/sdk/src/token/effects/index.ts`
- Test: `packages/sdk/src/token/effects/__tests__/balance.test.ts`
- Test: `packages/sdk/src/token/effects/__tests__/transfer.test.ts`

Port each token operation to a standalone Effect function. Each function uses `yield* Relayer`, `yield* Signer`, etc. from the service context. Event emission uses `yield* EventEmitter`.

Key functions:

- `balanceOf(tokenAddress, owner?)` — check cache, allow credentials, userDecrypt, save cache
- `decryptBalance(tokenAddress, handle, owner?)` — single handle decrypt
- `batchDecryptBalances(tokenAddresses, options)` — `Effect.forEach` with concurrency
- `confidentialTransfer(tokenAddress, to, amount)` — encrypt + writeContract
- `shield(tokenAddress, wrapper, amount, options)` — allowance check + wrap
- `unshield(tokenAddress, amount)` — encrypt + unwrap + finalize
- `finalizeUnwrap(wrapper, burnHandle)` — publicDecrypt + finalize tx

**Step 1: Write failing tests for balance and transfer effects**

**Step 2-5: Implement, verify, commit**

```
feat: port token operations to Effect functions
```

---

### Task 10: Public API Classes — Token and ReadonlyToken

**Files:**

- Modify: `packages/sdk/src/token/readonly-token.ts`
- Modify: `packages/sdk/src/token/token.ts`

Rewrite `ReadonlyToken` and `Token` to delegate to Effect functions from Task 9. Each method calls `Effect.runPromise(effect.pipe(Effect.provide(this.#layer)))`. The `#layer` is built in the constructor from config using the layer factories from Task 7.

Constructor signature and public method signatures stay identical. The class stores `#layer: Layer.Layer<Relayer | Signer | CredentialStorage | SessionStorage | EventEmitter>`.

**Step 1: Rewrite ReadonlyToken**

**Step 2: Run existing tests**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/readonly-token.test.ts`
Expected: Tests should pass (same behavior, different internals)

**Step 3: Rewrite Token**

**Step 4: Run existing tests**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/token.test.ts`
Expected: Tests should pass

**Step 5: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass

**Step 6: Commit**

```
refactor: rewrite Token and ReadonlyToken to use Effect internally
```

---

### Task 11: Public API Class — ZamaSDK

**Files:**

- Modify: `packages/sdk/src/token/zama-sdk.ts`

Rewrite `ZamaSDK` to build the layer graph and pass it to Token/ReadonlyToken. Signer lifecycle (subscribe) stays as imperative code — it triggers layer rebuild on chain/account change.

**Step 1: Rewrite ZamaSDK**

**Step 2: Run existing tests**

Run: `pnpm vitest run packages/sdk/src/token/__tests__/zama-sdk.test.ts`
Expected: PASS

**Step 3: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass

**Step 4: Commit**

```
refactor: rewrite ZamaSDK to compose Effect layers
```

---

### Task 12: Update Exports and Test Fixtures

**Files:**

- Modify: `packages/sdk/src/index.ts`
- Modify: `packages/sdk/src/node/index.ts`
- Modify: `packages/sdk/src/test-fixtures.ts`

Update barrel exports:

- Export new tagged errors alongside old ones (or replace them)
- Export `makeRelayerWebLayer` and `makeRelayerNodeLayer` for advanced users
- Update test fixtures to work with the new internals

**Step 1: Update index.ts exports**

**Step 2: Update node/index.ts to export RelayerNode layer**

**Step 3: Update test-fixtures.ts** — the `createMockRelayer` should still return a mock compatible with the new Layer factories

**Step 4: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass

**Step 5: Commit**

```
refactor: update exports and test fixtures for Effect redesign
```

---

### Task 13: Delete Old Code

**Files:**

- Delete: `packages/sdk/src/relayer/relayer-web.ts`
- Delete: `packages/sdk/src/relayer/relayer-node.ts`
- Delete: `packages/sdk/src/relayer/relayer-sdk.ts`
- Delete: `packages/sdk/src/token/credentials-manager.ts`
- Modify: `packages/sdk/src/relayer/relayer-utils.ts` — remove `withRetry`, `isTransientError`, `sleep`
- Modify: `packages/sdk/src/token/errors.ts` — keep for backward compat or remove if fully replaced

**Step 1: Delete old files**

**Step 2: Remove withRetry from relayer-utils.ts** (keep pure utilities: configs, buildEIP712DomainType, mergeFhevmConfig)

**Step 3: Fix any remaining imports**

**Step 4: Run full test suite**

Run: `pnpm test:run`
Expected: All tests pass

**Step 5: Run build**

Run: `cd packages/sdk && pnpm build`
Expected: Build succeeds

**Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

**Step 7: Commit**

```
refactor: remove legacy promise-lock relayer classes and CredentialsManager
```

---

### Task 14: Final Verification

**Step 1: Run full test suite with coverage**

Run: `pnpm test:coverage`
Expected: All tests pass, coverage >= 80% on lines/branches/functions

**Step 2: Run build**

Run: `cd packages/sdk && pnpm build`
Expected: Clean build, no warnings

**Step 3: Verify bundle doesn't expose effect**

Run: `grep -r "from \"effect\"" packages/sdk/dist/ || echo "OK: effect is bundled"`
Expected: No raw `from "effect"` imports in dist — rolldown inlined it

**Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors

**Step 5: Run lint**

Run: `pnpm lint`
Expected: No lint errors

**Step 6: Final commit if any fixups needed**

```
chore: final verification and cleanup
```
