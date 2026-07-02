import { EventEmitter } from "node:events";
import { describe, test, expect, vi, afterEach } from "../../test-fixtures";
import { LoggerService } from "../../services/logger-service";
import { NodeWorkerPool } from "../worker.node-pool";
import type { NodeWorkerPoolConfig } from "../worker.node-pool";
import { NodeWorkerClient } from "../worker.node-client";
import { DEFAULT_TIMEOUT_MS } from "../worker.base-client";
import { WorkerTimeoutError } from "../../errors";
import type { WorkerRequest } from "../worker.types";

// ---------------------------------------------------------------------------
// Pool-level cascade / self-healing test (SDK-237 headline behavior).
//
// The main `worker.node-pool.test.ts` mocks NodeWorkerClient wholesale, so the
// recycle path never runs at the pool boundary. Here we use the REAL client and
// stub only `createWorker` to return a controllable fake worker_threads worker,
// exercising dispatch → real timeout → #recycleStuckWorker → terminate → lazy
// re-init end-to-end.
// ---------------------------------------------------------------------------

interface FakeWorker extends EventEmitter {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  unref: ReturnType<typeof vi.fn>;
  /** When true, domain ops get no response and therefore time out. */
  hang: boolean;
}

/**
 * A minimal stand-in for a `node:worker_threads` Worker: INIT always resolves so
 * the pool initializes; domain ops resolve unless `hang` is set.
 */
function makeFakeWorker(): FakeWorker {
  const worker = new EventEmitter() as FakeWorker;
  worker.hang = false;
  worker.terminate = vi.fn();
  worker.unref = vi.fn();
  worker.postMessage = vi.fn((req: WorkerRequest) => {
    if (req.type === "INIT") {
      queueMicrotask(() =>
        worker.emit("message", { id: req.id, type: req.type, success: true, data: {} }),
      );
      return;
    }
    if (worker.hang) {
      return; // no response → the operation times out
    }
    queueMicrotask(() =>
      worker.emit("message", {
        id: req.id,
        type: req.type,
        success: true,
        data: { publicKey: "pk", privateKey: "sk" },
      }),
    );
  });
  return worker;
}

describe("NodeWorkerPool — timeout recovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test("recycles a timed-out worker and re-inits the slot on the next dispatch (cascade fix)", async () => {
    const created: FakeWorker[] = [];
    vi.spyOn(
      NodeWorkerClient.prototype as unknown as { createWorker: () => FakeWorker },
      "createWorker",
    ).mockImplementation(() => {
      const w = makeFakeWorker();
      created.push(w);
      return w;
    });

    const pool = new NodeWorkerPool({
      chains: [{ chainId: 1 }],
      poolSize: 1,
      logger: new LoggerService(),
    } as unknown as NodeWorkerPoolConfig);
    await pool.initPool();
    expect(created).toHaveLength(1);
    const stuck = created[0]!;

    // The single worker now hangs on its next op, so that op will time out.
    stuck.hang = true;

    vi.useFakeTimers();
    let err: Error | undefined;
    try {
      const p = pool.generateKeypair({ chainId: 1 }).catch((e: Error) => {
        err = e;
      });
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      await p;
    } finally {
      vi.useRealTimers();
    }

    // The operation timed out with a typed error...
    expect(err).toBeInstanceOf(WorkerTimeoutError);
    expect((err as WorkerTimeoutError).worker).toBe("node-worker-0");
    // ...and the hung worker was recycled (terminated) so it self-heals.
    expect(stuck.terminate).toHaveBeenCalledOnce();

    // The next dispatch re-inits the slot with a FRESH worker and succeeds — the
    // hung worker is replaced rather than re-selected-while-stuck (the exact
    // cascade SDK-237 fixes).
    const result = await pool.generateKeypair({ chainId: 1 });
    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
    expect(created).toHaveLength(2);
    expect(created[1]).not.toBe(stuck);
    expect(created[1]!.terminate).not.toHaveBeenCalled();

    pool.terminate();
  });

  test("recycleWorkerOnTimeout: false leaves the pool worker in place on timeout", async () => {
    const created: FakeWorker[] = [];
    vi.spyOn(
      NodeWorkerClient.prototype as unknown as { createWorker: () => FakeWorker },
      "createWorker",
    ).mockImplementation(() => {
      const w = makeFakeWorker();
      created.push(w);
      return w;
    });

    const pool = new NodeWorkerPool({
      chains: [{ chainId: 1 }],
      poolSize: 1,
      recycleWorkerOnTimeout: false,
      logger: new LoggerService(),
    } as unknown as NodeWorkerPoolConfig);
    await pool.initPool();
    const worker = created[0]!;
    worker.hang = true;

    vi.useFakeTimers();
    try {
      const p = pool.generateKeypair({ chainId: 1 }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      await p;
    } finally {
      vi.useRealTimers();
    }

    // Opted out of recycling: the worker is not torn down and no fresh worker
    // is spawned for the slot.
    expect(worker.terminate).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);

    pool.terminate();
  });
});
