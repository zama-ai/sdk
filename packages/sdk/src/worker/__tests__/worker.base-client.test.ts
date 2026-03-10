import { describe, it, expect, vi, afterEach } from "../../test-fixtures";
import { BaseWorkerClient, DEFAULT_TIMEOUT_MS } from "../worker.base-client";
import type {
  GenericLogger,
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
  logger?: GenericLogger;
}

let requestIdCounter = 0;

class TestWorkerClient extends BaseWorkerClient<TestWorker, TestConfig> {
  lastWorker: TestWorker | null = null;
  createWorkerCount = 0;

  constructor(config?: Partial<TestConfig>) {
    const cfg: TestConfig = { initType: "NODE_INIT", ...config };
    super(cfg, cfg.logger);
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

  it("resolves promise on success response", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { publicKey: "pk", privateKey: "sk" });

    const result = await client.generateKeypair();
    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
  });

  it("rejects promise on error response", async () => {
    const client = await initClient();
    autoRejectPostMessage(client, "decrypt failed");

    await expect(client.generateKeypair()).rejects.toThrow("decrypt failed");
  });

  it("rejects with timeout when no response arrives", async () => {
    vi.useFakeTimers();

    try {
      const client = new TestWorkerClient();
      const worker: TestWorker = { postMessage: vi.fn(), terminate: vi.fn() };
      client.lastWorker = worker;
      vi.spyOn(client, "initWorker").mockResolvedValue(worker);

      // Start the request and attach rejection handler before advancing timers
      let rejectedError: Error | undefined;
      const promise = client.generateKeypair().catch((e: Error) => {
        rejectedError = e;
      });

      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
      await promise;

      expect(rejectedError).toBeDefined();
      expect(rejectedError!.message).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs warning for unknown response ID without crashing", async () => {
    const warn = vi.fn();
    const mockLogger: GenericLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn,
      error: vi.fn(),
    };
    const client = new TestWorkerClient({ logger: mockLogger });

    client.simulateResponse({
      id: "unknown-id",
      type: "GENERATE_KEYPAIR",
      success: true,
      data: {},
    });

    expect(warn).toHaveBeenCalledWith("[WorkerClient] Received response for unknown request", {
      id: "unknown-id",
    });
  });

  it("worker error rejects all pending and terminates worker", async () => {
    const client = await initClient();
    const worker = client.lastWorker!;

    const p1 = client.generateKeypair();
    const p2 = client.getPublicKey();

    // Flush so the requests are registered in pendingRequests
    await flush();

    client.simulateWorkerError("crash!");

    await expect(p1).rejects.toThrow("Worker error: crash!");
    await expect(p2).rejects.toThrow("Worker error: crash!");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("message deserialization error rejects all pending and terminates worker", async () => {
    const client = await initClient();
    const worker = client.lastWorker!;

    const p1 = client.generateKeypair();

    await flush();

    client.simulateMessageError();

    await expect(p1).rejects.toThrow("Worker message deserialization failed");
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminate rejects all pending with 'Worker terminated'", async () => {
    const client = await initClient();

    const p1 = client.generateKeypair();

    await flush();

    client.terminate();

    await expect(p1).rejects.toThrow("Worker terminated");
  });

  it("concurrent initWorker calls only create worker once", async () => {
    const client = createAutoResolvingClient();

    const [w1, w2] = await Promise.all([client.initWorker(), client.initWorker()]);

    expect(w1).toBe(w2);
    expect(client.createWorkerCount).toBe(1);
  });

  it("init failure resets so subsequent call retries", async () => {
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

  it("userDecrypt sends correct type and payload", async () => {
    const client = await initClient();

    const params = {
      handles: [HANDLE],
      contractAddress: "0xC" as `0x${string}`,
      signedContractAddresses: ["0xS" as `0x${string}`],
      privateKey: "sk",
      publicKey: "pk",
      signature: "sig",
      signerAddress: "0xA" as `0x${string}`,
      startTimestamp: 100,
      durationDays: 7,
    };

    autoResolvePostMessage(client, { clearValues: { [HANDLE]: 42n } });

    const result = await client.userDecrypt(params);
    expect(result).toEqual({ clearValues: { [HANDLE]: 42n } });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("USER_DECRYPT");
    expect(lastCall.payload).toEqual(params);
  });

  it("error response includes statusCode when present", async () => {
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
      await client.generateKeypair();
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("rate limited");
      expect((err as Error & { statusCode?: number }).statusCode).toBe(429);
    }
  });

  it("terminate is a no-op when no worker exists", () => {
    const client = new TestWorkerClient();
    client.terminate();
  });

  it("handleWorkerError without existing worker does not throw", () => {
    const client = new TestWorkerClient();
    client.simulateWorkerError("crash!");
  });

  it("handleWorkerMessageError without existing worker does not throw", () => {
    const client = new TestWorkerClient();
    client.simulateMessageError();
  });

  it("encrypt sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { handles: [], inputProof: "0x" });

    const params = {
      values: [{ value: 1n, type: "euint8" as const }],
      contractAddress: "0xC" as `0x${string}`,
      userAddress: "0xU" as `0x${string}`,
    };
    const result = await client.encrypt(params);
    expect(result).toEqual({ handles: [], inputProof: "0x" });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("ENCRYPT");
  });

  it("publicDecrypt sends correct type and payload", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { clearValues: {} });

    await client.publicDecrypt([HANDLE]);

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("PUBLIC_DECRYPT");
    expect(lastCall.payload).toEqual({ handles: [HANDLE] });
  });

  it("createEIP712 sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, {});

    await client.createEIP712({
      publicKey: "pk",
      contractAddresses: ["0x1" as `0x${string}`],
      startTimestamp: 1000,
      durationDays: 7,
    });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("CREATE_EIP712");
  });

  it("createDelegatedUserDecryptEIP712 sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, {});

    await client.createDelegatedUserDecryptEIP712({
      publicKey: "pk",
      contractAddresses: ["0x1" as `0x${string}`],
      delegatorAddress: "0xD" as `0x${string}`,
      startTimestamp: 100,
      durationDays: 7,
    });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("CREATE_DELEGATED_EIP712");
  });

  it("delegatedUserDecrypt sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { clearValues: {} });

    await client.delegatedUserDecrypt({
      handles: [HANDLE],
      contractAddress: "0xC" as `0x${string}`,
      signedContractAddresses: ["0xS" as `0x${string}`],
      privateKey: "sk",
      publicKey: "pk",
      signature: "sig",
      delegatorAddress: "0xD" as `0x${string}`,
      delegateAddress: "0xE" as `0x${string}`,
      startTimestamp: 100,
      durationDays: 7,
    });

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("DELEGATED_USER_DECRYPT");
  });

  it("requestZKProofVerification sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, "0xproof");

    await client.requestZKProofVerification({ proof: "0x" } as never);

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("REQUEST_ZK_PROOF_VERIFICATION");
  });

  it("getPublicKey sends correct type", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { result: null });

    await client.getPublicKey();

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("GET_PUBLIC_KEY");
  });

  it("getPublicParams sends correct type and bits", async () => {
    const client = await initClient();
    autoResolvePostMessage(client, { result: null });

    await client.getPublicParams(2048);

    const lastCall = client.lastWorker!.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
    expect(lastCall.type).toBe("GET_PUBLIC_PARAMS");
    expect(lastCall.payload).toEqual({ bits: 2048 });
  });

  it("worker error during init terminates the worker", async () => {
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

  it("sendRequest auto-initializes worker if not yet initialized", async () => {
    const client = createAutoResolvingClient();
    const result = await client.generateKeypair();
    expect(result).toEqual({ initialized: true });
  });
});
