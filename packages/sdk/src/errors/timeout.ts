import { ZamaError, ZamaErrorCode } from "./base";

/**
 * A worker operation (encrypt / decrypt / EIP-712 / key fetch) did not complete
 * within its configured timeout — typically a stuck relayer or WASM call. On the
 * Node pool the SDK **recycles the affected worker** (terminating the hung
 * thread) so it self-heals; the operation itself is **retryable**.
 *
 * Configure the bound (seconds) via `node({ operationTimeout })`. Distinct from a
 * decryption/entitlement failure — a timeout is an infrastructure/latency
 * condition, so it no longer collapses into {@link DecryptionFailedError}.
 *
 * @example
 * ```ts
 * try {
 *   await sdk.decryption.decryptValues([{ encryptedValue, contractAddress }]);
 * } catch (e) {
 *   if (e instanceof WorkerTimeoutError) {
 *     // retry (the worker was recycled); consider raising operationTimeout
 *   }
 * }
 * ```
 */
export class WorkerTimeoutError extends ZamaError {
  /**
   * The worker operation that timed out. This is the internal worker op code
   * (e.g. `USER_DECRYPT`, `ENCRYPT`), not the public SDK method name.
   */
  readonly operation: string;
  /** The configured timeout that was exceeded, in **seconds** (the SDK's duration unit). */
  readonly timeout: number;
  /** Wall-clock time the operation ran before being abandoned, in **seconds** (may be fractional). */
  readonly elapsed: number;
  /** Label of the worker that stalled, when known (e.g. `node-worker-2`). */
  readonly worker: string | undefined;

  constructor(
    args: { operation: string; timeout: number; elapsed: number; worker?: string },
    options?: ErrorOptions,
  ) {
    super(
      ZamaErrorCode.OperationTimeout,
      `Worker operation ${args.operation} timed out after ${args.timeout}s` +
        (args.worker ? ` (worker ${args.worker})` : ""),
      options,
    );
    this.name = "WorkerTimeoutError";
    this.operation = args.operation;
    this.timeout = args.timeout;
    this.elapsed = args.elapsed;
    this.worker = args.worker;
  }
}

/**
 * An in-flight worker operation was aborted as **collateral** when its worker was
 * recycled — the worker was torn down to recover from *another* operation's
 * timeout (Node pool self-healing), not because this operation itself timed out.
 *
 * The operation never reached a verdict, so it is **retryable**: the next call
 * lazily re-inits a fresh worker. It is intentionally distinct from
 * {@link WorkerTimeoutError} (this op did not exceed its own bound) and from
 * {@link DecryptionFailedError} (nothing actually failed to decrypt) — so a
 * consumer can retry it instead of surfacing a terminal failure.
 *
 * @example
 * ```ts
 * matchZamaError(error, {
 *   WORKER_RECYCLED: () => retry(), // transient: the worker was replaced
 * });
 * ```
 */
export class WorkerRecycledError extends ZamaError {
  /**
   * The worker operation that was aborted. This is the internal worker op code
   * (e.g. `USER_DECRYPT`, `ENCRYPT`), not the public SDK method name.
   */
  readonly operation: string;
  /** Label of the recycled worker, when known (e.g. `node-worker-2`). */
  readonly worker: string | undefined;

  constructor(args: { operation: string; worker?: string }, options?: ErrorOptions) {
    super(
      ZamaErrorCode.WorkerRecycled,
      `Worker operation ${args.operation} was aborted because its worker was recycled after a timeout` +
        (args.worker ? ` (worker ${args.worker})` : ""),
      options,
    );
    this.name = "WorkerRecycledError";
    this.operation = args.operation;
    this.worker = args.worker;
  }
}
