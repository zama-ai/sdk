import { describe, test, expect, vi, afterEach } from "../../test-fixtures";
import { LoggerService } from "../../services/logger-service";
import { BaseWorkerClient, DEFAULT_TIMEOUT_MS } from "../worker.base-client";
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

interface TestConfig {
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
    const worker: TestWorker = {
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
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

  protected getInitPayload(): {
    type: WorkerRequestType;
    payload: WorkerRequest["payload"];
  } {
    return {
      type: this.config.initType,
      payload: {
        fhevmConfig: { chainId: 1 },
      } as unknown as WorkerRequest["payload"],
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
      client.simulateResponse({
        id: req.id,
        type: req.type,
        success: true,
        data,
      });
    });
  });
}

function autoRejectPostMessage(client: TestWorkerClient, error: string): void {
  client.lastWorker!.postMessage.mockImplementation((req: WorkerRequest) => {
    Promise.resolve().then(() => {
      client.simulateResponse({
        id: req.id,
        type: req.type,
        success: false,
        error,
      });
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
    const sink: GenericLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
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
    const sink: GenericLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
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

  test("rejects with timeout when no response arrives", async () => {
    vi.useFakeTimers();

    try {
      const client = new TestWorkerClient();
      const worker: TestWorker = { postMessage: vi.fn(), terminate: vi.fn() };
      client.lastWorker = worker;
      vi.spyOn(client, "initWorker").mockResolvedValue(worker);

      // Start the request and attach rejection handler before advancing timers
      let rejectedError: Error | undefined;
      const promise = client.generateKeypair({ chainId: 1 }).catch((error: Error) => {
        rejectedError = error;
      });

      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      await promise;

      expect(rejectedError).toBeDefined();
      expect(rejectedError!.message).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("logs warning for unknown response ID without crashing", async () => {
    const warn = vi.fn();
    const mockLogger: GenericLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn,
      error: vi.fn(),
    };
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

  test("error response includes statusCode when present", async () => {
    const client = await initClient();

    client.lastWorker!.postMessage.mockImplementation((req: WorkerRequest) => {
      Promise.resolve().then(() => {
        client.simulateResponse({
          id: req.id,
          type: req.type,
          success: false,
          error: "rate limited",
          statusCode: 429,
        } as WorkerResponse<unknown> & { statusCode: number });
      });
    });

    try {
      await client.generateKeypair({ chainId: 1 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as Error).message).toBe("rate limited");
      expect((error as Error & { statusCode?: number }).statusCode).toBe(429);
    }
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

    await client.requestZKProofVerification({
      chainId: 1,
      zkProof: { proof: "0x" } as never,
    });

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
