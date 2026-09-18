import * as comlink from "comlink";
import { afterEach, beforeEach, expect, type MockInstance, vi } from "vitest";
import { LoggerService } from "../../services/logger-service";
import type { EncryptOffloadBackend } from "../protocol";
import { WORKER_READY_MESSAGE } from "../protocol";
import {
  DEFAULT_ENCRYPT_WORKER_TIMEOUTS,
  EncryptWorkerClient,
  type EncryptWorkerTimeouts,
} from "../encrypt-worker-client";

export const WORKER_RESULT = { encryptedValue: "0xworker", inputProof: "0xab" };

/** What the inline (calling-thread) client answers with, so degrades are visible. */
export const INLINE_RESULT = { encryptedValue: "0xinline", inputProof: "0x01" };

/** Stand-in for the Worker global; Comlink is mocked, so only lifecycle events matter. */
export class MockWorker {
  readonly listeners = new Map<string, Set<(event: unknown) => void>>();
  terminated = false;
  /** Counted, so a teardown racing a release can be shown to terminate once. */
  terminations = 0;

  constructor(
    readonly source?: unknown,
    readonly options?: unknown,
  ) {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(listener);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  postMessage(): void {}

  terminate(): void {
    this.terminated = true;
    this.terminations++;
  }

  emitReady(): void {
    for (const l of this.listeners.get("message") ?? []) {
      l({ data: WORKER_READY_MESSAGE });
    }
  }

  crash(message: string): void {
    for (const l of this.listeners.get("error") ?? []) {
      l({ message });
    }
  }
}

export type SpawnBehavior = ((worker: MockWorker) => void) | undefined;

export function spawnReady(worker: MockWorker): void {
  queueMicrotask(() => worker.emitReady());
}

export type MockWorkerState = {
  readonly workers: MockWorker[];
  spawnBehavior: SpawnBehavior;
  /** Builds a registered worker by hand, for the caller-supplied-factory tests. */
  create: () => MockWorker;
};

export function installMockWorker(options?: { spawn?: SpawnBehavior }): MockWorkerState {
  const state: MockWorkerState = {
    workers: [],
    spawnBehavior: options && "spawn" in options ? options.spawn : spawnReady,
    create: () => new Spawned(),
  };

  class Spawned extends MockWorker {
    constructor(source?: unknown, workerOptions?: unknown) {
      super(source, workerOptions);
      state.workers.push(this);
      state.spawnBehavior?.(this);
    }
  }

  vi.stubGlobal("Worker", Spawned);
  return state;
}

/** A `Worker` global that throws on construction, as a CSP-blocked realm does. */
export function blockWorkerConstruction(message: string): void {
  vi.stubGlobal("Worker", function BlockedWorker(): never {
    throw new Error(message);
  });
}

export type WorkerHarness = MockWorkerState & {
  /** The unconditional console channel `warnAlways` writes to. */
  readonly consoleWarn: MockInstance<(...args: unknown[]) => void>;
};

/**
 * Registers the per-test hooks every worker client suite needs: a recording
 * `Worker` global, a silenced console, and a clean slate afterwards.
 */
export function installWorkerHarness(): WorkerHarness {
  let state: MockWorkerState;
  let consoleWarn: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    state = installMockWorker();
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarn.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  return {
    get workers() {
      return state.workers;
    },
    get spawnBehavior() {
      return state.spawnBehavior;
    },
    set spawnBehavior(behavior: SpawnBehavior) {
      state.spawnBehavior = behavior;
    },
    create: () => state.create(),
    get consoleWarn() {
      return consoleWarn;
    },
  };
}

export function makeApi() {
  return {
    init: vi.fn(
      async (_payload: unknown, _rpcRequest: unknown, _log: unknown, _onProgress: unknown) => {},
    ),
    encryptValue: vi.fn(async (_id: number, _parameters: unknown) => WORKER_RESULT),
    encryptValues: vi.fn(async (_id: number, _parameters: unknown) => ({
      encryptedValues: ["0xworker"],
      inputProof: "0xab",
    })),
    abort: vi.fn(async (_id: number) => {}),
  };
}

export type MockApi = ReturnType<typeof makeApi>;

/** Holds the next worker `encryptValue` open; the returned call answers it. */
export function deferEncrypt(api: MockApi): () => void {
  let settle: ((value: typeof WORKER_RESULT) => void) | undefined;
  api.encryptValue.mockReturnValue(
    new Promise((resolve) => {
      settle = resolve;
    }),
  );
  return () => settle!(WORKER_RESULT);
}

/** Holds every worker `encryptValue` open, so concurrent calls can be settled in order. */
export function queueEncrypts(api: MockApi) {
  const resolvers: ((value: typeof WORKER_RESULT) => void)[] = [];
  let settled = 0;
  api.encryptValue.mockImplementation(
    () =>
      new Promise((resolve) => {
        resolvers.push(resolve);
      }),
  );

  return {
    /** Waits until exactly `count` calls have reached the worker. */
    async waitForCalls(count: number): Promise<void> {
      await vi.waitFor(() => expect(resolvers).toHaveLength(count));
    },
    /** Answers the oldest still-open calls, all of them by default. */
    settle(count = resolvers.length - settled): void {
      for (const resolve of resolvers.slice(settled, settled + count)) {
        resolve(WORKER_RESULT);
      }
      settled += count;
    },
  };
}

export type MockedBackend = EncryptOffloadBackend &
  Record<keyof EncryptOffloadBackend, ReturnType<typeof vi.fn>>;

export function makeInlineClient(): MockedBackend {
  return {
    init: vi.fn(async () => {}),
    encryptValue: vi.fn(async () => INLINE_RESULT),
    encryptValues: vi.fn(async () => ({ encryptedValues: ["0xinline"], inputProof: "0x01" })),
  } as unknown as MockedBackend;
}

export const ENCRYPT_VALUE_ARGS = {
  value: { type: "euint64", value: 42n },
  contractAddress: "0xc",
  userAddress: "0xu",
} as never;

/** Stand-in for the prefetched key bytes; only identity and cloneability matter here. */
export const PREFETCHED_KEY = {
  publicKeyBytes: { id: "pk", bytes: new Uint8Array([1, 2, 3]) },
  crsBytes: { id: "crs", capacity: 2048, bytes: new Uint8Array([4, 5]) },
  metadata: { relayerUrl: "https://relayer.example", chainId: 1 },
} as never;

export function makeClient(args?: {
  network?: unknown;
  strict?: boolean;
  workerSource?: string | URL | (() => Worker);
  timeouts?: Partial<EncryptWorkerTimeouts>;
  blockedReason?: string;
}) {
  const api = makeApi();
  vi.mocked(comlink.wrap).mockReturnValue(api as never);
  const inline = makeInlineClient();
  const warn = vi.fn();
  // A real LoggerService, as production wiring supplies: messages reach `warn`
  // prefixed with `[zama-sdk]`.
  const logger = new LoggerService({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() });
  const prefetchKey = vi.fn(async () => PREFETCHED_KEY);
  const client = new EncryptWorkerClient({
    initPayload: { chain: { id: 1 } as never, clientOptions: { batchRpcCalls: true }, runtime: {} },
    network: (args?.network ?? "https://rpc.example") as string,
    prefetchKey,
    createInlineClient: () => inline,
    logger,
    timeouts: { ...DEFAULT_ENCRYPT_WORKER_TIMEOUTS, ...args?.timeouts },
    strict: args?.strict ?? false,
    workerSource: args?.workerSource,
    blockedReason: args?.blockedReason,
  });
  return { client, api, inline, warn, prefetchKey };
}

/** The single progress callback the client registers at init, shared by every operation. */
export function progressChannel(api: MockApi) {
  return api.init.mock.calls[0]![3] as (id: number, event: unknown) => void;
}
