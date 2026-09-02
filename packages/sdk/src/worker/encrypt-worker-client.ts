import { proxy, transfer, wrap, type Remote } from "comlink";
import type { EIP1193Provider } from "viem";
import { EncryptOffloadUnavailableError } from "../errors/encryption";
import type { FhevmClientOptions } from "../relayer/types";
import type { LoggerService } from "../services/logger-service";
import type {
  EncryptOffloadBackend,
  EncryptWorkerApi,
  WireInitPayload,
  WireProgressEvent,
  WireRequestOptions,
} from "./protocol";
import { WORKER_READY_MESSAGE, fromWireError, isWireError, toWireError } from "./protocol";
import { createEncryptWorker } from "./spawn";

/**
 * Watchdog deadlines, in milliseconds, for worker lifecycle steps: each is a
 * ceiling on "the worker never answered", not on legitimate slow work. Encrypt
 * operations themselves are not watched: nothing bounds local WASM compute, so
 * a proof may run for as long as it needs.
 */
export type EncryptWorkerTimeouts = {
  /** Worker startup + module-graph load; a bundler that mishandled the worker URL fails here. */
  readonly spawn: number;
  /** Client init inside the worker realm: chain reads and WASM compilation. */
  readonly init: number;
};

export const DEFAULT_ENCRYPT_WORKER_TIMEOUTS: EncryptWorkerTimeouts = {
  spawn: 10_000,
  init: 300_000,
};

/** Second crash pins the client to the calling thread. */
const CRASH_PIN_THRESHOLD = 2;

/** Stable prefix of every degrade warning. */
export const ENCRYPT_OFFLOAD_WARN_PREFIX = "Encrypt offload unavailable";

/** Workers already returned by an `offloadWorker` factory, to catch a factory that hands out one worker forever. */
const handedOutWorkers = new WeakSet<Worker>();

/** Internal signal: the worker infrastructure failed; the operation itself was not rejected. */
class WorkerUnavailableError extends Error {
  /** True when a worker that had already signalled ready died under us, so a respawn is worth trying. */
  readonly crashed: boolean;

  constructor(message: string, options?: ErrorOptions & { readonly crashed?: boolean }) {
    super(message, options);
    this.name = "WorkerUnavailableError";
    this.crashed = options?.crashed ?? false;
  }
}

/**
 * A payload Comlink could not clone into the worker (`DataCloneError`) or could
 * not return out of it (its own `TypeError`): a boundary failure, so it degrades
 * rather than reaching the caller as an application error.
 */
function isCloneFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const { name, message } = error as { name?: unknown; message?: unknown };
  return (
    name === "DataCloneError" ||
    (name === "TypeError" &&
      typeof message === "string" &&
      message.includes("Unserializable return value"))
  );
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  }
}

/** What the client remembers about worker crashes, dropped whole by a worker answer and by a release. */
type CrashHistory = {
  readonly count: number;
  /** The crash that killed the current worker, so a call landing after it degrades as a crash too. */
  readonly last: WorkerUnavailableError | undefined;
  /** Crash count the degrade warning was last emitted for, so one failure warns once. */
  readonly warnedFor: number;
};

const NO_CRASHES: CrashHistory = { count: 0, last: undefined, warnedFor: -1 };

/**
 * The key copied for the crossing plus the buffers to transfer, so the wire copy
 * is moved instead of cloned. Anything but the known binary shape crosses
 * unchanged.
 */
function keyForTransfer(key: FhevmClientOptions["fheEncryptionKey"]): {
  readonly key: FhevmClientOptions["fheEncryptionKey"];
  readonly transfers: Transferable[];
} {
  if (key === undefined) {
    return { key, transfers: [] };
  }
  const publicKeyBytes = key.publicKeyBytes.bytes;
  const crsBytes = key.crsBytes.bytes;
  if (!(publicKeyBytes instanceof Uint8Array) || !(crsBytes instanceof Uint8Array)) {
    return { key, transfers: [] };
  }
  // `slice` yields a fresh exactly-sized buffer, so transferring it leaves this
  // thread's cached key intact.
  const publicKeyCopy = publicKeyBytes.slice();
  const crsCopy = crsBytes.slice();
  return {
    key: {
      ...key,
      publicKeyBytes: { ...key.publicKeyBytes, bytes: publicKeyCopy },
      crsBytes: { ...key.crsBytes, bytes: crsCopy },
    },
    transfers: [publicKeyCopy.buffer as ArrayBuffer, crsCopy.buffer as ArrayBuffer],
  };
}

/**
 * Per-call options: `signal` is forwarded as an `abort` call, `onProgress` is
 * served from the worker's shared progress channel, and `never` keeps the
 * callback contravariantly compatible with each operation's own event type.
 */
type CallOptions = WireRequestOptions & {
  readonly signal?: AbortSignal;
  readonly onProgress?: (args: never) => void;
};

/**
 * Everything scoped to one spawned worker, created by the init that spawns it
 * and dropped whole by a teardown. A late event carrying its own generation can
 * therefore only settle that generation, never the worker running in its place.
 */
type WorkerGeneration = {
  /** Memoized bring-up for this worker; it dies with the generation, so the next call re-runs it. */
  initPromise: Promise<void> | undefined;
  worker: Worker | undefined;
  api: Remote<EncryptWorkerApi> | undefined;
  /** Never resolves; teardown rejects it, and every boundary crossing races it so all of them settle together. */
  readonly doomed: Promise<never>;
  /** Rejects `doomed` with the teardown's `WorkerUnavailableError`. */
  readonly doom: (error: WorkerUnavailableError) => void;
};

function createWorkerGeneration(): WorkerGeneration {
  let doom!: (error: WorkerUnavailableError) => void;
  const doomed = new Promise<never>((_resolve, reject) => {
    doom = reject;
  });
  // An idle teardown dooms a generation with no crossing racing it; this
  // handler keeps that from surfacing as an unhandled rejection.
  doomed.catch(() => {});
  return { initPromise: undefined, worker: undefined, api: undefined, doomed, doom };
}

export type EncryptWorkerClientConfig = {
  readonly initPayload: Omit<WireInitPayload, "rpcUrl">;
  /** The chain's RPC endpoint: a URL crosses into the worker; a provider is proxied per request. */
  readonly network: EIP1193Provider | string;
  /** Fetches the FHE key on the calling thread, where the chain's auth applies; the worker realm never downloads it itself. */
  readonly prefetchKey: () => Promise<FhevmClientOptions["fheEncryptionKey"]>;
  readonly createInlineClient: () => EncryptOffloadBackend;
  readonly logger: LoggerService;
  readonly timeouts: EncryptWorkerTimeouts;
  /** A string or `URL` is spawned with the SDK's worker options; a factory is called for the worker itself. */
  readonly workerSource?: string | URL | (() => Worker);
  /**
   * A pre-known reason offload cannot work in this session: init degrades with
   * it immediately, so strict rejects at call time rather than at config time.
   */
  readonly blockedReason?: string;
  /**
   * Strict offload (`offloadEncrypt: true`): never run encryption on the
   * calling thread. Every path that would degrade rejects with
   * {@link EncryptOffloadUnavailableError} instead.
   */
  readonly strict: boolean;
};

/**
 * Encrypt backend that runs `@fhevm/sdk` in a dedicated module worker so proof
 * generation never blocks the main thread. Only infrastructure failure degrades
 * to inline (or rejects under `strict`); worker-reported errors are rethrown,
 * since inline would fail the same way.
 */
export class EncryptWorkerClient implements EncryptOffloadBackend {
  readonly #config: EncryptWorkerClientConfig;
  /** Resources of the worker currently being brought up or served; undefined while none runs. */
  #generation: WorkerGeneration | undefined;
  /** True once the client runs inline for the rest of its life, with no further spawn attempts. */
  #pinnedInline = false;
  #crashes: CrashHistory = NO_CRASHES;
  /** Wire ids, allocated across generations so a late reply can never be read as a live operation. */
  #sequence = 0;
  /** Per-operation `onProgress`, keyed by wire id and routed over one channel registered at init: one channel per worker avoids minting a `MessageChannel` per call, whose local port and listener would linger until garbage collection after terminate. */
  readonly #progressListeners = new Map<number, (event: WireProgressEvent) => void>();
  /** Memoized inline backend. Kept, with its key copy, across a worker recovery so a later degrade skips the refetch. */
  #degradePromise: Promise<EncryptOffloadBackend> | undefined;
  /** Operations that must drain before a requested release terminates the worker. */
  #active = 0;
  #releaseRequested = false;

  constructor(config: EncryptWorkerClientConfig) {
    this.#config = config;
  }

  init = (): Promise<void> => {
    // A call landing mid-drain rides the worker being released rather than
    // cancelling the release: the drain still completes, and the call after it
    // spawns a fresh worker.
    const generation = (this.#generation ??= createWorkerGeneration());
    if (generation.initPromise === undefined) {
      // Only a successful cycle is memoized: a failure a retry could clear must
      // not be replayed to every later call.
      const attempt: Promise<void> = this.#withActive(() => this.#initOnce(generation)).catch(
        (error: unknown) => {
          if (generation.initPromise === attempt) {
            generation.initPromise = undefined;
          }
          throw error;
        },
      );
      generation.initPromise = attempt;
    }
    return generation.initPromise;
  };

  encryptValue: EncryptOffloadBackend["encryptValue"] = (parameters) =>
    this.#withActive(() =>
      this.#dispatch(
        (backend) => backend.encryptValue(parameters),
        // Spread, so a field upstream adds to the parameters still crosses; the
        // stripped `options` replaces the caller's, which carries `signal`.
        (api, id, options) => api.encryptValue(id, { ...parameters, options }),
        parameters.options,
      ),
    );

  encryptValues: EncryptOffloadBackend["encryptValues"] = (parameters) =>
    this.#withActive(() =>
      this.#dispatch(
        (backend) => backend.encryptValues(parameters),
        (api, id, options) => api.encryptValues(id, { ...parameters, options }),
        parameters.options,
      ),
    );

  /**
   * Releases the worker without changing what callers observe: in-flight
   * operations (an init included) run to completion over the worker, and the
   * worker is terminated as soon as the last one settles, immediately if the
   * client is idle. The client is not spent: the release resets it whole, so a
   * later call re-fetches the key and spawns a fresh worker exactly like the
   * first one, even if the client had degraded to the calling thread. The drain
   * is not bounded: a worker wedged inside an operation is only terminated once
   * that operation settles.
   */
  dispose(): void {
    this.#releaseRequested = true;
    this.#releaseIfIdle();
  }

  /**
   * The one place that decides between the worker and the calling thread:
   * inline once pinned or while no worker is running; otherwise the worker,
   * falling back to inline on infrastructure failure while application errors
   * pass through.
   */
  async #dispatch<T>(
    invoke: (backend: EncryptOffloadBackend) => Promise<T>,
    overWorker: (
      api: Remote<EncryptWorkerApi>,
      id: number,
      options: WireRequestOptions,
    ) => Promise<T>,
    callOptions: CallOptions | undefined,
  ): Promise<T> {
    const { signal, onProgress, ...options } = callOptions ?? {};
    // The worker dequeues an abort only after the proof, so a dispatched call always runs whole.
    throwIfAborted(signal);
    await this.init();
    // A listener added after the abort never fires, so an abort during init needs this recheck.
    throwIfAborted(signal);
    const generation = this.#generation;
    const api = generation?.api;
    // An existing degrade attempt already carries the decision that created it,
    // and its inline backend caches the key, so reuse it rather than degrading again.
    if (this.#degradePromise !== undefined && (this.#pinnedInline || api === undefined)) {
      return invoke(await this.#degradePromise);
    }
    if (generation === undefined || api === undefined) {
      return invoke(
        await this.#degrade(
          generation,
          this.#crashes.last ?? new WorkerUnavailableError("Encrypt worker not running."),
        ),
      );
    }
    const id = this.#sequence++;
    const onAbort = () => void api.abort(id).catch(() => {});
    signal?.addEventListener("abort", onAbort, { once: true });
    if (onProgress) {
      this.#progressListeners.set(id, onProgress as (event: WireProgressEvent) => void);
    }
    try {
      const result = await this.#overBoundary(generation, overWorker(api, id, options));
      // A worker operation that answered clears the crash history: two unrelated
      // crashes far apart must not add up to a permanent degrade.
      this.#crashes = NO_CRASHES;
      return result;
    } catch (error) {
      if (error instanceof WorkerUnavailableError) {
        return invoke(await this.#degrade(generation, error));
      }
      throw error;
    } finally {
      this.#progressListeners.delete(id);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  async #initOnce(generation: WorkerGeneration): Promise<void> {
    if (this.#pinnedInline) {
      // The degrade that pinned the client already initialized the backend every call now runs on.
      return;
    }
    const blockedReason = this.#config.blockedReason;
    if (blockedReason !== undefined) {
      // Handled before any resource is spent: non-strict callers never get here
      // (the relayer inlines directly), and strict throws out of the degrade.
      await this.#degrade(generation, new WorkerUnavailableError(blockedReason));
      return;
    }
    // Outside the degrade guard: a failed key fetch is an application/network
    // error, and the inline backend would refetch the same key from the same
    // relayer. It rejects out of init exactly as the inline arm's would.
    const fheEncryptionKey = await this.#config.prefetchKey();
    try {
      const api = await this.#spawn(generation);
      const network = this.#config.network;
      const rpcRequest =
        typeof network === "string"
          ? null
          : proxy(async (args: { method: string; params?: unknown }) => {
              try {
                return await network.request(args as Parameters<EIP1193Provider["request"]>[0]);
              } catch (error) {
                // Comlink keeps only name/message/stack on a thrown error, which
                // would strip the provider's `code` (4001, -32005) the worker's
                // classifiers read; flatten it so those fields cross.
                throw toWireError(error);
              }
            });
      // A callback that throws would reject the Comlink proxy call back in the
      // worker realm, where nothing can report it, so it is contained here.
      const log = proxy((level: "debug" | "warn" | "error", message: string) => {
        try {
          this.#config.logger[level](message);
        } catch (error) {
          this.#warnCallbackThrew("logger", error);
        }
      });
      const onProgress = proxy((id: number, event: WireProgressEvent) => {
        try {
          this.#progressListeners.get(id)?.(event);
        } catch (error) {
          this.#warnCallbackThrew("onProgress", error);
        }
      });
      // The copy stays on this thread so a later degrade to inline reuses the
      // key instead of refetching; transferring the wire copy avoids a third
      // in-transit copy of it.
      const wireKey = keyForTransfer(fheEncryptionKey);
      await this.#overBoundary(
        generation,
        api.init(
          transfer(
            {
              ...this.#config.initPayload,
              clientOptions: {
                ...this.#config.initPayload.clientOptions,
                fheEncryptionKey: wireKey.key,
              },
              rpcUrl: typeof network === "string" ? network : undefined,
            },
            wireKey.transfers,
          ),
          rpcRequest,
          log,
          onProgress,
        ),
        { ms: this.#config.timeouts.init, operation: "init" },
      );
      generation.api = api;
      this.#crashes = { ...this.#crashes, last: undefined };
    } catch (error) {
      // Only "the worker never answered or crashed" is infrastructure. An error
      // the worker itself reported (a chain read, bad key material) would fail
      // the same way inline, so it reaches the caller unchanged.
      if (!(error instanceof WorkerUnavailableError)) {
        this.#teardown(generation, new WorkerUnavailableError("Encrypt worker init failed."));
        throw error;
      }
      await this.#degrade(generation, error);
    }
  }

  /** Reports a caller callback that threw; the reporting itself must not throw back into the worker. */
  #warnCallbackThrew(callback: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      this.#config.logger.warn(`Encrypt offload ${callback} callback threw: ${reason}`);
    } catch {
      // A logger that throws on its own warning leaves nowhere left to report.
    }
  }

  /**
   * The count spans a whole public entry, its init included, so a release
   * requested mid-call cannot terminate the worker between the init and the
   * operation.
   */
  async #withActive<T>(work: () => Promise<T>): Promise<T> {
    this.#active++;
    try {
      return await work();
    } finally {
      this.#active--;
      this.#releaseIfIdle();
    }
  }

  #releaseIfIdle(): void {
    if (!this.#releaseRequested || this.#active > 0) {
      return;
    }
    this.#releaseRequested = false;
    this.#generation?.worker?.terminate();
    // A full reset, so a release is the recovery lever for a degraded client:
    // the next call re-fetches the key and spawns a fresh worker either way.
    this.#generation = undefined;
    this.#degradePromise = undefined;
    this.#pinnedInline = false;
    this.#crashes = NO_CRASHES;
  }

  #createWorker(): Worker {
    const source = this.#config.workerSource;
    if (source === undefined) {
      return createEncryptWorker();
    }
    if (typeof source === "function") {
      const worker = source();
      // A memoized factory would hand the client a worker it already terminated,
      // so the contract is one fresh Worker per call.
      if (handedOutWorkers.has(worker)) {
        this.#config.logger.warnAlways(
          "The offloadWorker factory returned a worker it already handed out; each call must construct a fresh Worker.",
        );
      }
      handedOutWorkers.add(worker);
      return worker;
    }
    return new Worker(source, { type: "module", name: "zama-fhe-encrypt" });
  }

  /** Resolves once the worker's module graph has loaded. */
  async #spawn(generation: WorkerGeneration): Promise<Remote<EncryptWorkerApi>> {
    let worker: Worker;
    try {
      worker = this.#createWorker();
    } catch (error) {
      // A blocked construction is infrastructure, so it must reach the
      // degrade path as such rather than as the raw thrown error.
      throw new WorkerUnavailableError(error instanceof Error ? error.message : String(error), {
        cause: error,
      });
    }
    generation.worker = worker;
    const api = await this.#raceReady(generation, worker);
    this.#armCrashHandler(generation, worker);
    return api;
  }

  /** Resolves with the Comlink API on the worker's ready message; rejects on the spawn deadline or a pre-ready error. */
  #raceReady(generation: WorkerGeneration, worker: Worker): Promise<Remote<EncryptWorkerApi>> {
    return new Promise<Remote<EncryptWorkerApi>>((resolve, reject) => {
      const settle = () => {
        clearTimeout(timer);
        worker.removeEventListener("message", onReady);
        worker.removeEventListener("error", onError);
      };
      const timer = setTimeout(() => {
        settle();
        reject(
          new WorkerUnavailableError(
            `Encrypt worker did not start within ${this.#config.timeouts.spawn}ms.`,
          ),
        );
      }, this.#config.timeouts.spawn);
      const onReady = (event: MessageEvent) => {
        if (event.data === WORKER_READY_MESSAGE) {
          settle();
          resolve(wrap<EncryptWorkerApi>(worker));
        }
      };
      const onError = (event: ErrorEvent) => {
        settle();
        const message = event.message || "Encrypt worker error.";
        // A worker that never came up is not worth respawning per call, so
        // this failure is not flagged as a crash.
        reject(new WorkerUnavailableError(message));
        this.#teardown(generation, new WorkerUnavailableError(message));
      };
      worker.addEventListener("message", onReady);
      worker.addEventListener("error", onError);
    });
  }

  /** Permanent crash detector, armed only after ready so a pre-ready failure never counts as a crash. */
  #armCrashHandler(generation: WorkerGeneration, worker: Worker): void {
    worker.addEventListener("error", (event: ErrorEvent) => {
      // A generation already torn down cannot crash the client again: nothing
      // is waiting on it, and the worker running in its place is unaffected.
      if (this.#generation !== generation) {
        return;
      }
      // A ready worker died under us: the teardown drops the memoized init so
      // the next call spawns a fresh one, and the operations it took down
      // finish inline.
      const crash = new WorkerUnavailableError(event.message || "Encrypt worker error.", {
        crashed: true,
      });
      this.#crashes = { ...this.#crashes, count: this.#crashes.count + 1, last: crash };
      this.#teardown(generation, crash);
    });
  }

  /**
   * Awaits one promise crossing the worker boundary, racing the generation's
   * `doomed` promise so a teardown settles it with the teardown's
   * `WorkerUnavailableError`, which degrades it inline. Without a `deadline` it
   * settles whenever the worker answers; a `deadline` bounds a lifecycle step,
   * and missing it means the worker is presumed stuck, so the generation is
   * torn down whole.
   */
  async #overBoundary<T>(
    generation: WorkerGeneration,
    work: Promise<T>,
    deadline?: { readonly ms: number; readonly operation: string },
  ): Promise<T> {
    const timer =
      deadline === undefined
        ? undefined
        : setTimeout(() => {
            this.#teardown(
              generation,
              new WorkerUnavailableError(
                `Encrypt worker ${deadline.operation} timed out after ${deadline.ms}ms.`,
              ),
            );
          }, deadline.ms);
    try {
      return await Promise.race([
        work.catch((error: unknown) => {
          const failure = isWireError(error) ? fromWireError(error) : (error as Error);
          // A payload Comlink could not carry is infrastructure, so it degrades
          // instead of reaching the caller as the operation's own failure.
          throw isCloneFailure(failure)
            ? new WorkerUnavailableError(failure.message, { cause: failure })
            : failure;
        }),
        generation.doomed,
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Rejects and drops one generation whole: its worker, its memoized init, and
   * every crossing racing its `doomed` promise. The next call therefore re-runs
   * the cycle on a fresh generation, so a spurious teardown costs a respawn
   * rather than a permanent degrade.
   */
  #teardown(generation: WorkerGeneration | undefined, error: WorkerUnavailableError): void {
    if (generation === undefined) {
      return;
    }
    if (this.#generation === generation) {
      this.#generation = undefined;
    }
    generation.worker?.terminate();
    generation.worker = undefined;
    generation.api = undefined;
    generation.initPromise = undefined;
    generation.doom(error);
  }

  async #degrade(
    generation: WorkerGeneration | undefined,
    cause: unknown,
  ): Promise<EncryptOffloadBackend> {
    const reason = cause instanceof Error ? cause.message : String(cause);
    if (this.#config.strict) {
      this.#teardown(generation, new WorkerUnavailableError("Encrypt worker unavailable."));
      throw new EncryptOffloadUnavailableError(
        `Encrypt offload required (offloadEncrypt: true) but unavailable: ${reason}`,
        { cause },
      );
    }
    const { transient, pinning } = this.#classifyDegrade(cause);
    this.#pinnedInline ||= !transient;
    this.#teardown(generation, new WorkerUnavailableError("Encrypt worker degraded to inline."));
    this.#warnDegraded(reason, transient, pinning);
    if (this.#degradePromise === undefined) {
      // Only a live backend is memoized: an inline init is a key refetch, and a
      // transient failure there must not close the degrade path for the session.
      const attempt: Promise<EncryptOffloadBackend> = (async () => {
        const inline = this.#config.createInlineClient();
        await inline.init();
        return inline;
      })().catch((error: unknown) => {
        if (this.#degradePromise === attempt) {
          this.#degradePromise = undefined;
        }
        this.#config.logger.warnAlways(
          `Encrypt inline fallback failed to initialize: ${error instanceof Error ? error.message : String(error)}`,
        );
        throw error;
      });
      this.#degradePromise = attempt;
    }
    return this.#degradePromise;
  }

  /**
   * How one failure degrades, read off the state before the degrade mutates it:
   * `transient` diverts only this call, `pinning` settles the client inline now.
   * One crash is treated as transient; a repeat crash, or a worker that never
   * came up, settles the client inline rather than spawning a replacement per call.
   */
  #classifyDegrade(cause: unknown): { readonly transient: boolean; readonly pinning: boolean } {
    const transient =
      cause instanceof WorkerUnavailableError &&
      cause.crashed &&
      this.#crashes.count < CRASH_PIN_THRESHOLD;
    return { transient, pinning: !transient && !this.#pinnedInline };
  }

  /** One warning per failure, whether it pins the client inline or only diverts this call. */
  #warnDegraded(reason: string, transient: boolean, pinning: boolean): void {
    if (!pinning && this.#crashes.warnedFor === this.#crashes.count) {
      return;
    }
    this.#crashes = { ...this.#crashes, warnedFor: this.#crashes.count };
    const scope = transient ? "in-flight encryption falls back" : "encryption falls back";
    // Always on the console: a silent return to main-thread encryption is the
    // freeze this offload prevents.
    this.#config.logger.warnAlways(
      `${ENCRYPT_OFFLOAD_WARN_PREFIX}, ${scope} to the calling thread: ${reason}`,
    );
  }
}
