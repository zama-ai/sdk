import { describe, test, expect, vi, afterEach } from "../../test-fixtures";
import { LoggerService } from "../../services/logger-service";
import { BaseWorkerClient, DEFAULT_TIMEOUT_MS, INIT_TIMEOUT_MS } from "../worker.base-client";
import type { WorkerClientTimeoutConfig } from "../worker.base-client";
import { WorkerTimeoutError } from "../../errors";
import type {
  GenericLogger,
  WorkerEnv,
  WorkerRequest,
  WorkerRequestType,
  WorkerResponse,
} from "../worker.types";

const HANDLE = ("0x" + "11".repeat(32)) as `0x${string}`;

// ---------------------------------------------------------------------------
// TestWorkerClient — in-memory implementation for testing the base class
// ---------------------------------------------------------------------------

interface TestWorker {
  postMessage: ReturnType<typeof vi.fn<(req: WorkerRequest) => void>>;
  terminate: ReturnType<typeof vi.fn<() => void>>;
}

interface TestConfig extends WorkerClientTimeoutConfig {
  initType: WorkerRequestType;
  logger?: LoggerService;
}

let requestIdCounter = 0;

class TestWorkerClient extends BaseWorkerClient<TestWorker, TestConfig> {
  protected readonly env: WorkerEnv = "node";
  lastWorker: TestWorker | null = null;
  createWorkerCount = 0;

  constructor(config?: Partial<TestConfig>) {
    const cfg: TestConfig = { initType: "INIT", ...config };
    super(cfg, cfg.logger ?? new LoggerService());
  }

  protected createWorker(): TestWorker {
    this.createWorkerCount++;
    const worker: TestWorker = { postMessage: vi.fn(), terminate: vi.fn() };
    this.lastWorker = worker;
    return worker;
  }

  protected wireEvents(_worker: TestWorker): void {
    // No-op: we call handleResponse / handleWorkerError manually in tests
  }

  protected postMessage(worker: TestWorker, request: WorkerRequest): void {
    worker.postMessage(request);
  }

  protected terminateWorker(worker: TestWorker): void {
    worker.terminate();
  }

  protected generateRequestId(): string {
    return `req-${++requestIdCounter}`;
  }

  protected getInitPayload(): { type: WorkerRequestType; payload: WorkerRequest["payload"] } {
    return {
      type: this.config.initType,
      payload: { fhevmConfig: { chainId: 1 } } as unknown as WorkerRequest["payload"],
    };
  }

  // Expose protected methods for testing
  simulateResponse(response: WorkerResponse<unknown>): void {
    this.handleResponse(response);
  }

  simulateWorkerError(message: string): void {
    this.handleWorkerError(message);
  }

  simulateMessageError(): void {
    this.handleWorkerMessageError();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createAutoResolvingClient(config?: Partial<TestConfig>): TestWorkerClient {
  const client = new TestWorkerClient(config);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origCreate = (client as any).createWorker.bind(client);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.spyOn(client as any, "createWorker").mockImplementation(() => {
    const worker = origCreate();
    worker.postMessage.mockImplementation((req: WorkerRequest) => {
      Promise.resolve().then(() => {
        client.simulateResponse({
          id: req.id,
          type: req.type,
          success: true,
          data: { initialized: true },
        });
      });
    });
    return worker;
  });
  return client;
}

async function initClient(config?: Partial<TestConfig>): Promise<TestWorkerClient> {
  const client = createAutoResolvingClient(config);
  await client.initWorker();
  // Reset postMessage to no-op for domain requests
  client.lastWorker!.postMessage.mockImplementation(() => {});
  return client;
}

function autoResolvePostMessage(client: TestWorkerClient, data: unknown = {}): void {
  client.lastWorker!.postMessage.mockImplementation((req: WorkerRequest) => {
    Promise.resolve().then(() => {
      client.simulateResponse({ id: req.id, type: req.type, success: true, data });
    });
  });
}

function autoRejectPostMessage(client: TestWorkerClient, error: string): void {
  client.lastWorker!.postMessage.mockImplementation((req: WorkerRequest) => {
    Promise.resolve().then(() => {
      client.simulateResponse({ id: req.id, type: req.type, success: false, error });
    });
  });
}

/** Flush microtasks so that `sendRequest`'s `await initWorker()` resolves
 *  and the request is registered in pendingRequests before we act on it. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

describe("BaseWorkerClient", () => {
  afterEach(() => {
    requestIdCounter = 0;
    vi.restoreAllMocks();
  });

  test("resolves promise on success response", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { publicKey: "pk", privateKey: "sk" });

    const result = await client.generateKeypair({ chainId: 1 });
    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
  });

  test("rejects promise on error response", async () => {
    const client = await initClient();
    autoRejectPostMessage(client, "decrypt failed");

    await expect(client.generateKeypair({ chainId: 1 })).rejects.toThrow("decrypt failed");
  });

  test("logs a handled request failure at debug, never error", async () => {
    const sink: GenericLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = await initClient({ logger: new LoggerService(sink) });
    autoRejectPostMessage(client, "decrypt failed");

    await expect(client.generateKeypair({ chainId: 1 })).rejects.toThrow("decrypt failed");

    // The failure is surfaced via the rejected promise; logging it at `error`
    // would duplicate a handled failure into the consumer's monitoring.
    expect(sink.error).not.toHaveBeenCalled();
    expect(sink.debug).toHaveBeenCalledWith(
      expect.stringContaining("FAILED"),
      expect.objectContaining({ error: "decrypt failed" }),
    );
  });

  test("logs a genuine worker fault at error", async () => {
    const sink: GenericLogger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const client = await initClient({ logger: new LoggerService(sink) });

    const pending = client.generateKeypair({ chainId: 1 });
    await flush();

    // A worker-level crash is an unexpected internal fault — the other half of
    // the SDK-230 invariant: it MUST surface at `error`, unlike a handled
    // per-request rejection (which stays at `debug`).
    client.simulateWorkerError("crash!");
    await expect(pending).rejects.toThrow("Worker error: crash!");

    expect(sink.error).toHaveBeenCalledWith(
      expect.stringContaining("Worker error"),
      expect.objectContaining({ error: "crash!" }),
    );
  });

  test("rejects with a typed WorkerTimeoutError carrying operation/timeout/elapsed", async () => {
    vi.useFakeTimers();

    try {
      const client = new TestWorkerClient({ workerLabel: "node-worker-1" });
      const worker: TestWorker = { postMessage: vi.fn(), terminate: vi.fn() };
      client.lastWorker = worker;
      vi.spyOn(client, "initWorker").mockResolvedValue(worker);

      let rejectedError: Error | undefined;
      const promise = client.generateKeypair({ chainId: 1 }).catch((error: Error) => {
        rejectedError = error;
      });

      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      await promise;

      expect(rejectedError).toBeInstanceOf(WorkerTimeoutError);
      const e = rejectedError as WorkerTimeoutError;
      expect(e.message).toMatch(/timed out/);
      expect(e.operation).toBe("GENERATE_KEYPAIR");
      expect(e.timeout).toBe(DEFAULT_TIMEOUT_MS / 1000);
      expect(e.elapsed).toBeGreaterThanOrEqual(DEFAULT_TIMEOUT_MS / 1000);
      // The configured worker label surfaces on the error end-to-end.
      expect(e.worker).toBe("node-worker-1");
    } finally {
      vi.useRealTimers();
    }
  });

  test("honors operationTimeout from config", async () => {
    vi.useFakeTimers();
    try {
      const client = new TestWorkerClient({ operationTimeout: 5 });
      const worker: TestWorker = { postMessage: vi.fn(), terminate: vi.fn() };
      client.lastWorker = worker;
      vi.spyOn(client, "initWorker").mockResolvedValue(worker);

      let err: Error | undefined;
      const p = client.generateKeypair({ chainId: 1 }).catch((e: Error) => {
        err = e;
      });

      await vi.advanceTimersByTimeAsync(4_999);
      expect(err).toBeUndefined(); // not yet
      await vi.advanceTimersByTimeAsync(1);
      await p;
      expect(err).toBeInstanceOf(WorkerTimeoutError);
      expect((err as WorkerTimeoutError).timeout).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  test("an INIT timeout surfaces as a WorkerTimeoutError on the init bound", async () => {
    vi.useFakeTimers();
    try {
      // createWorker() posts a no-op INIT, so init never resolves and times out.
      const client = new TestWorkerClient();
      let err: Error | undefined;
      const p = client.initWorker().catch((e: Error) => {
        err = e;
      });
      await vi.advanceTimersByTimeAsync(INIT_TIMEOUT_MS);
      await p;

      expect(err).toBeInstanceOf(WorkerTimeoutError);
      expect((err as WorkerTimeoutError).operation).toBe("INIT");
      expect((err as WorkerTimeoutError).timeout).toBe(INIT_TIMEOUT_MS / 1000);
    } finally {
      vi.useRealTimers();
    }
  });

  test("recycles the stuck worker after a timeout (terminate + re-init on next call)", async () => {
    const client = await initClient(); // real timers; #worker is set
    const stuck = client.lastWorker!;
    expect(client.createWorkerCount).toBe(1);

    vi.useFakeTimers();
    try {
      // postMessage is a no-op after initClient → the request will time out.
      let err: Error | undefined;
      const p = client.generateKeypair({ chainId: 1 }).catch((e: Error) => {
        err = e;
      });
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      await p;
      expect(err).toBeInstanceOf(WorkerTimeoutError);
      expect(stuck.terminate).toHaveBeenCalledOnce(); // recycled
    } finally {
      vi.useRealTimers();
    }

    // The worker was nulled, so the next init lazily spawns a fresh one
    // (createAutoResolvingClient's mock auto-resolves the new worker's INIT).
    await client.initWorker();
    expect(client.createWorkerCount).toBe(2);
  });

  test("rejects sibling in-flight requests as a plain recycle error, not a fake timeout", async () => {
    const client = await initClient({ workerLabel: "node-worker-1" }); // real timers; #worker is set

    vi.useFakeTimers();
    try {
      // First request will time out at DEFAULT_TIMEOUT_MS and recycle the worker.
      let firstErr: Error | undefined;
      const first = client.generateKeypair({ chainId: 1 }).catch((e: Error) => {
        firstErr = e;
      });

      // Sibling starts 1s later, so its own deadline is well after the first's.
      await vi.advanceTimersByTimeAsync(1_000);
      let siblingErr: Error | undefined;
      const sibling = client.generateKeypair({ chainId: 1 }).catch((e: Error) => {
        siblingErr = e;
      });

      // Advance to the first request's deadline → it times out and recycles.
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS - 1_000);
      await Promise.all([first, sibling]);

      // The operation that actually exceeded its bound gets a typed timeout.
      expect(firstErr).toBeInstanceOf(WorkerTimeoutError);
      // The sibling was aborted by the recycle, not timed out: plain error, and
      // crucially NOT a WorkerTimeoutError claiming it ran the full timeout.
      expect(siblingErr).toBeInstanceOf(Error);
      expect(siblingErr).not.toBeInstanceOf(WorkerTimeoutError);
      expect(siblingErr!.message).toMatch(/recycled/i);
      // The recycle reason names the worker for diagnostics.
      expect(siblingErr!.message).toContain("node-worker-1");
    } finally {
      vi.useRealTimers();
    }
  });

  test("recycleWorkerOnTimeout: false leaves the worker in place", async () => {
    const client = await initClient({ recycleWorkerOnTimeout: false });
    const worker = client.lastWorker!;

    vi.useFakeTimers();
    try {
      const p = client.generateKeypair({ chainId: 1 }).catch(() => undefined);
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      await p;
      expect(worker.terminate).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  test("logs warning for unknown response ID without crashing", async () => {
    const warn = vi.fn();
    const mockLogger: GenericLogger = { info: vi.fn(), debug: vi.fn(), warn, error: vi.fn() };
    const client = new TestWorkerClient({ logger: new LoggerService(mockLogger) });

    client.simulateResponse({
      id: "unknown-id",
      type: "GENERATE_KEYPAIR",
      success: true,
      data: {},
    });

    expect(warn).toHaveBeenCalledWith(
      "[zama-sdk] [WorkerClient] Received response for unknown request",
      { id: "unknown-id" },
    );
  });

  test("worker error rejects all pending and terminates worker", async () => {
    const client = await initClient();
    const worker = client.lastWorker!;

    const p1 = client.generateKeypair({ chainId: 1 });
    const p2 = client.getPublicKey({ chainId: 1 });

    // Flush so the requests are registered in pendingRequests
    await flush();

    client.simulateWorkerError("crash!");

    await expect(p1).rejects.toThrow("Worker error: crash!");
    await expect(p2).rejects.toThrow("Worker error: crash!");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  test("message deserialization error rejects all pending and terminates worker", async () => {
    const client = await initClient();
    const worker = client.lastWorker!;

    const p1 = client.generateKeypair({ chainId: 1 });

    await flush();

    client.simulateMessageError();

    await expect(p1).rejects.toThrow("Worker message deserialization failed");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  test("terminate rejects all pending with 'Worker terminated'", async () => {
    const client = await initClient();

    const p1 = client.generateKeypair({ chainId: 1 });

    await flush();

    client.terminate();

    await expect(p1).rejects.toThrow("Worker terminated");
  });

  test("concurrent initWorker calls only create worker once", async () => {
    const client = createAutoResolvingClient();

    const [w1, w2] = await Promise.all([client.initWorker(), client.initWorker()]);

    expect(w1).toBe(w2);
    expect(client.createWorkerCount).toBe(1);
  });

  test("init failure resets so subsequent call retries", async () => {
    const client = new TestWorkerClient();
    let callCount = 0;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(client as any, "createWorker").mockImplementation(() => {
      callCount++;
      const worker: TestWorker = {
        postMessage: vi.fn().mockImplementation((req: WorkerRequest) => {
          Promise.resolve().then(() => {
            if (callCount === 1) {
              client.simulateResponse({
                id: req.id,
                type: req.type,
                success: false,
                error: "init failed",
              });
            } else {
              client.simulateResponse({
                id: req.id,
                type: req.type,
                success: true,
                data: { initialized: true },
              });
            }
          });
        }),
        terminate: vi.fn(),
      };
      client.lastWorker = worker;
      return worker;
    });

    await expect(client.initWorker()).rejects.toThrow("init failed");
    await expect(client.initWorker()).resolves.toBeDefined();
    expect(callCount).toBe(2);
  });

  test("userDecrypt sends correct type and payload", async () => {
    const client = await initClient();

    const params = {
      chainId: 1,
      encryptedValues: [HANDLE],
      contractAddress: "0xC" as `0x${string}`,
      signedContractAddresses: ["0xS" as `0x${string}`],
      privateKey: "0xsk" as `0x${string}`,
      publicKey: "0xpk" as `0x${string}`,
      signature: "0xsig" as `0x${string}`,
      signerAddress: "0xA" as `0x${string}`,
      startTimestamp: 100,
      durationDays: 7,
    };

    autoResolvePostMessage(client, { clearValues: { [HANDLE]: 42n } });

    const result = await client.userDecrypt(params);
    expect(result).toEqual({ clearValues: { [HANDLE]: 42n } });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("USER_DECRYPT");
    expect(lastCall.payload).toEqual(params);
  });

  test("rebuilds the error and its scalar signal fields from the serialized envelope", async () => {
    const client = await initClient();

    client.lastWorker!.postMessage.mockImplementation((req: WorkerRequest) => {
      Promise.resolve().then(() => {
        client.simulateResponse({
          id: req.id,
          type: req.type,
          success: false,
          error: "rate limited",
          serialized: { name: "Error", message: "rate limited", statusCode: 429, retryAfter: 3 },
        } as WorkerResponse<unknown>);
      });
    });

    try {
      await client.generateKeypair({ chainId: 1 });
      expect.unreachable("should have thrown");
    } catch (error) {
      const e = error as Error & { statusCode?: number; retryAfter?: number };
      expect(e.message).toBe("rate limited");
      expect(e.statusCode).toBe(429);
      expect(e.retryAfter).toBe(3);
    }
  });

  test("rebuilds the cause chain so chain-walking classification keeps working", async () => {
    const client = await initClient();

    client.lastWorker!.postMessage.mockImplementation((req: WorkerRequest) => {
      Promise.resolve().then(() => {
        client.simulateResponse({
          id: req.id,
          type: req.type,
          success: false,
          error: "could not coalesce error",
          serialized: {
            name: "Error",
            message: "could not coalesce error",
            code: "SERVER_ERROR",
            cause: { name: "Error", message: "Too Many Requests", code: -32005 },
          },
        } as WorkerResponse<unknown>);
      });
    });

    try {
      await client.generateKeypair({ chainId: 1 });
      expect.unreachable("should have thrown");
    } catch (error) {
      const cause = (error as Error & { cause?: { code?: number } }).cause;
      expect(cause?.code).toBe(-32005);
    }
  });

  test("falls back to a plain Error when the serialized envelope is absent", async () => {
    const client = await initClient();

    client.lastWorker!.postMessage.mockImplementation((req: WorkerRequest) => {
      Promise.resolve().then(() => {
        client.simulateResponse({
          id: req.id,
          type: req.type,
          success: false,
          error: "legacy error",
        } as WorkerResponse<unknown>);
      });
    });

    await expect(client.generateKeypair({ chainId: 1 })).rejects.toThrow("legacy error");
  });

  test("terminate is a no-op when no worker exists", () => {
    const client = new TestWorkerClient();
    client.terminate();
  });

  test("handleWorkerError without existing worker does not throw", () => {
    const client = new TestWorkerClient();
    client.simulateWorkerError("crash!");
  });

  test("handleWorkerMessageError without existing worker does not throw", () => {
    const client = new TestWorkerClient();
    client.simulateMessageError();
  });

  test("encrypt sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { handles: [], inputProof: "0x" });

    const params = {
      chainId: 1,
      values: [{ value: 1n, type: "euint8" as const }],
      contractAddress: "0xC" as `0x${string}`,
      userAddress: "0xU" as `0x${string}`,
    };
    const result = await client.encrypt(params);
    expect(result).toEqual({ handles: [], inputProof: "0x" });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("ENCRYPT");
  });

  test("publicDecrypt sends correct type and payload", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { clearValues: {} });

    await client.publicDecrypt({ chainId: 1, encryptedValues: [HANDLE] });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("PUBLIC_DECRYPT");
    expect(lastCall.payload).toEqual({ chainId: 1, encryptedValues: [HANDLE] });
  });

  test("createEIP712 sends correct type and payload", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, {});

    const params = {
      chainId: 1,
      publicKey: "0xpk" as `0x${string}`,
      contractAddresses: ["0x1" as `0x${string}`],
      startTimestamp: 1000,
      durationDays: 7,
    };
    await client.createEIP712(params);

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("CREATE_EIP712");
    expect(lastCall.payload).toEqual(params);
  });

  test("createDelegatedUserDecryptEIP712 sends correct type and payload", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, {});

    const params = {
      chainId: 1,
      publicKey: "0xpk" as `0x${string}`,
      contractAddresses: ["0x1" as `0x${string}`],
      delegatorAddress: "0xD" as `0x${string}`,
      startTimestamp: 100,
      durationDays: 7,
    };
    await client.createDelegatedUserDecryptEIP712(params);

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("CREATE_DELEGATED_EIP712");
    expect(lastCall.payload).toEqual(params);
  });

  test("delegatedUserDecrypt sends correct type and payload", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { clearValues: {} });

    const params = {
      chainId: 1,
      encryptedValues: [HANDLE],
      contractAddress: "0xC" as `0x${string}`,
      signedContractAddresses: ["0xS" as `0x${string}`],
      privateKey: "0xsk" as `0x${string}`,
      publicKey: "0xpk" as `0x${string}`,
      signature: "0xsig" as `0x${string}`,
      delegatorAddress: "0xD" as `0x${string}`,
      delegateAddress: "0xE" as `0x${string}`,
      startTimestamp: 100,
      durationDays: 7,
    };
    await client.delegatedUserDecrypt(params);

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("DELEGATED_USER_DECRYPT");
    expect(lastCall.payload).toEqual(params);
  });

  test("requestZKProofVerification sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, "0xproof");

    await client.requestZKProofVerification({ chainId: 1, zkProof: { proof: "0x" } as never });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("REQUEST_ZK_PROOF_VERIFICATION");
  });

  test("getPublicKey sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { result: null });

    await client.getPublicKey({ chainId: 1 });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("GET_PUBLIC_KEY");
  });

  test("getPublicParams sends correct type and bits", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { result: null });

    await client.getPublicParams({ chainId: 1, bits: 2048 });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0];
    expect(lastCall.type).toBe("GET_PUBLIC_PARAMS");
    expect(lastCall.payload).toEqual({ chainId: 1, bits: 2048 });
  });

  test("worker error during init terminates the worker", async () => {
    const client = new TestWorkerClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(client as any, "createWorker").mockImplementation(() => {
      const worker: TestWorker = {
        postMessage: vi.fn().mockImplementation((req: WorkerRequest) => {
          Promise.resolve().then(() => {
            client.simulateResponse({
              id: req.id,
              type: req.type,
              success: false,
              error: "WASM failed",
            });
          });
        }),
        terminate: vi.fn(),
      };
      client.lastWorker = worker;
      return worker;
    });

    await expect(client.initWorker()).rejects.toThrow("WASM failed");
    expect(client.lastWorker!.terminate).toHaveBeenCalledOnce();
  });

  test("sendRequest auto-initializes worker if not yet initialized", async () => {
    const client = createAutoResolvingClient();
    const result = await client.generateKeypair({ chainId: 1 });
    expect(result).toEqual({ initialized: true });
  });
});
