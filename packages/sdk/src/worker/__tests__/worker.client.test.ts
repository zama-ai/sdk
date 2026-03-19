import { describe, it, expect, beforeEach, afterEach, type Mock } from "../../test-fixtures";
import type { WorkerRequest, WorkerResponse } from "../worker.types";

// ---------------------------------------------------------------------------
// Hoisted mocks — vi.mock factories are hoisted above imports, so any
// variables they reference must be created via vi.hoisted().
// ---------------------------------------------------------------------------

interface MockWorker {
  postMessage: Mock;
  terminate: Mock;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: (() => void) | null;
}

interface MockNodeWorker {
  postMessage: Mock;
  terminate: Mock;
  unref: Mock;
  listeners: Record<string, ((...args: unknown[]) => void)[]>;
  on: Mock;
}

const { MockNodeWorkerClass, nodeUuidFn } = vi.hoisted(() => {
  const MockNodeWorkerClass = vi.fn();
  const nodeUuidFn = vi.fn();
  return { MockNodeWorkerClass, nodeUuidFn };
});

vi.mock(import("node:worker_threads"), () => ({
  default: { Worker: MockNodeWorkerClass },
  Worker: MockNodeWorkerClass,
}));

vi.mock(import("node:crypto"), () => ({
  default: { randomUUID: (...args: unknown[]) => nodeUuidFn(...args) },
  randomUUID: (...args: unknown[]) => nodeUuidFn(...args),
}));

// ---------------------------------------------------------------------------
// Mock: browser Worker constructor
// ---------------------------------------------------------------------------

let lastMockWorker: MockWorker | null = null;

function createMockWorker(): MockWorker {
  const worker: MockWorker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    onmessage: null,
    onerror: null,
    onmessageerror: null,
  };
  lastMockWorker = worker;
  return worker;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockWorkerClass: Mock = vi.fn(function (this: any) {
  return createMockWorker();
});
vi.stubGlobal("Worker", MockWorkerClass);

// ---------------------------------------------------------------------------
// Mock: crypto.randomUUID
// ---------------------------------------------------------------------------

let uuidCounter = 0;

vi.stubGlobal("crypto", {
  ...globalThis.crypto,
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// ---------------------------------------------------------------------------
// Mock: node:worker_threads helpers
// ---------------------------------------------------------------------------

let lastMockNodeWorker: MockNodeWorker | null = null;

function createMockNodeWorker(): MockNodeWorker {
  const worker: MockNodeWorker = {
    postMessage: vi.fn(),
    terminate: vi.fn(),
    unref: vi.fn(),
    listeners: {},
    on: vi.fn(),
  };
  worker.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (!worker.listeners[event]) {
      worker.listeners[event] = [];
    }
    worker.listeners[event].push(handler);
    return worker;
  });
  lastMockNodeWorker = worker;
  return worker;
}

// ---------------------------------------------------------------------------
// Import subjects under test (after mocks are set up)
// ---------------------------------------------------------------------------

const { RelayerWorkerClient } = await import("../worker.client");
const { NodeWorkerClient } = await import("../worker.node-client");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultWebConfig() {
  return {
    cdnUrl: "https://cdn.example.com/relayer.js",
    fhevmConfig: { chainId: 1 } as never,
    csrfToken: "csrf-token-123",
  };
}

function defaultNodeConfig() {
  return {
    fhevmConfig: { chainId: 1 } as never,
  };
}

/** Simulate a successful response for any request posted to a mock browser Worker. */
function autoResolveWebWorker(worker: MockWorker): void {
  worker.postMessage.mockImplementation((req: WorkerRequest) => {
    Promise.resolve().then(() => {
      worker.onmessage?.(
        new MessageEvent("message", {
          data: { id: req.id, type: req.type, success: true, data: { initialized: true } },
        }),
      );
    });
  });
}

/** Simulate a successful response for any request posted to a mock Node Worker. */
function autoResolveNodeWorker(worker: MockNodeWorker): void {
  worker.postMessage.mockImplementation((req: WorkerRequest) => {
    Promise.resolve().then(() => {
      const handler = worker.listeners["message"]?.[0];
      handler?.({ id: req.id, type: req.type, success: true, data: { initialized: true } });
    });
  });
}

/** Create a web worker mock that auto-resolves init, wire into the global constructor. */
function setupAutoResolvingWebWorker(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MockWorkerClass.mockImplementation(function (this: any) {
    const w = createMockWorker();
    autoResolveWebWorker(w);
    return w;
  });
}

/** Create a node worker mock that auto-resolves init, wire into the mock constructor. */
function setupAutoResolvingNodeWorker(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  MockNodeWorkerClass.mockImplementation(function (this: any) {
    const w = createMockNodeWorker();
    autoResolveNodeWorker(w);
    return w;
  });
}

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function getFirstPostedRequest(worker: MockWorker | MockNodeWorker): WorkerRequest {
  return worker.postMessage.mock.calls[0][0] as WorkerRequest;
}

function getLastPostedRequest(worker: MockWorker | MockNodeWorker): WorkerRequest {
  return worker.postMessage.mock.calls.at(-1)![0] as WorkerRequest;
}

// ===========================================================================
// RelayerWorkerClient
// ===========================================================================

describe("RelayerWorkerClient", () => {
  beforeEach(() => {
    lastMockWorker = null;
    uuidCounter = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MockWorkerClass.mockImplementation(function (this: any) {
      return createMockWorker();
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createWorker() creates a Web Worker via the Worker global", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());

    await client.initWorker();

    expect(MockWorkerClass).toHaveBeenCalledOnce();
    expect(lastMockWorker).not.toBeNull();

    client.terminate();
  });

  it("createWorker() revokes the blob URL after constructing the Worker", async () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();

    expect(revokeSpy).toHaveBeenCalledOnce();

    client.terminate();
    revokeSpy.mockRestore();
  });

  it("wireEvents() sets onmessage, onerror, onmessageerror on the worker", () => {
    const client = new RelayerWorkerClient(defaultWebConfig());
    const initPromise = client.initWorker();

    // Worker is created synchronously, event handlers are wired before postMessage
    expect(lastMockWorker!.onmessage).toBeTypeOf("function");
    expect(lastMockWorker!.onerror).toBeTypeOf("function");
    expect(lastMockWorker!.onmessageerror).toBeTypeOf("function");

    // Clean up: resolve init to avoid dangling promises
    const firstCall = getFirstPostedRequest(lastMockWorker!);
    lastMockWorker!.onmessage?.(
      new MessageEvent("message", {
        data: {
          id: firstCall.id,
          type: firstCall.type,
          success: true,
          data: { initialized: true },
        },
      }),
    );
    return initPromise.then(() => client.terminate());
  });

  it("postMessage() delegates to worker.postMessage()", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();

    expect(lastMockWorker!.postMessage).toHaveBeenCalledOnce();
    const req = getFirstPostedRequest(lastMockWorker!);
    expect(req.type).toBe("INIT");

    client.terminate();
  });

  it("terminateWorker() calls worker.terminate()", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();
    const worker = lastMockWorker!;

    client.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("generateRequestId() uses crypto.randomUUID()", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();

    const req = getFirstPostedRequest(lastMockWorker!);
    expect(req.id).toMatch(/^uuid-\d+$/);

    client.terminate();
  });

  it("getInitPayload() returns INIT type with full config as payload", async () => {
    setupAutoResolvingWebWorker();
    const config = defaultWebConfig();
    const client = new RelayerWorkerClient(config);
    await client.initWorker();

    const req = getFirstPostedRequest(lastMockWorker!);
    expect(req.type).toBe("INIT");
    expect(req.payload).toEqual(config);

    client.terminate();
  });

  it("initWorker() initializes the worker with CDN config", async () => {
    setupAutoResolvingWebWorker();
    const config = defaultWebConfig();
    const client = new RelayerWorkerClient(config);

    const worker = await client.initWorker();
    expect(worker).toBeDefined();

    const req = getFirstPostedRequest(lastMockWorker!);
    expect(req.type).toBe("INIT");
    expect(req.payload).toEqual(config);

    client.terminate();
  });

  it("onmessage handler dispatches response to handleResponse", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();
    const worker = lastMockWorker!;

    // Reset postMessage for subsequent requests
    worker.postMessage.mockImplementation(() => {});

    const keypairPromise = client.generateKeypair();
    await flush();

    const req = getLastPostedRequest(worker);
    worker.onmessage?.(
      new MessageEvent("message", {
        data: {
          id: req.id,
          type: req.type,
          success: true,
          data: { publicKey: "pk", privateKey: "sk" },
        },
      }),
    );

    const result = await keypairPromise;
    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });

    client.terminate();
  });

  it("onerror handler rejects pending requests", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();
    const worker = lastMockWorker!;

    worker.postMessage.mockImplementation(() => {});

    const keypairPromise = client.generateKeypair();
    await flush();

    worker.onerror?.(new ErrorEvent("error", { message: "worker crashed" }));

    await expect(keypairPromise).rejects.toThrow("Worker error: worker crashed");
  });

  it("onmessageerror handler rejects pending requests", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();
    const worker = lastMockWorker!;

    worker.postMessage.mockImplementation(() => {});

    const keypairPromise = client.generateKeypair();
    await flush();

    worker.onmessageerror?.();

    await expect(keypairPromise).rejects.toThrow("Worker message deserialization failed");
  });

  it("updateCsrf() sends UPDATE_CSRF request with the new token", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();
    const worker = lastMockWorker!;

    worker.postMessage.mockImplementation((req: WorkerRequest) => {
      Promise.resolve().then(() => {
        worker.onmessage?.(
          new MessageEvent("message", {
            data: { id: req.id, type: req.type, success: true, data: { updated: true } },
          }),
        );
      });
    });

    await client.updateCsrf("new-csrf-token");

    const req = getLastPostedRequest(worker);
    expect(req.type).toBe("UPDATE_CSRF");
    expect(req.payload).toEqual({ csrfToken: "new-csrf-token" });

    client.terminate();
  });

  it("handleResponse attaches statusCode from error response", async () => {
    setupAutoResolvingWebWorker();
    const client = new RelayerWorkerClient(defaultWebConfig());
    await client.initWorker();
    const worker = lastMockWorker!;

    worker.postMessage.mockImplementation(() => {});

    const keypairPromise = client.generateKeypair();
    await flush();

    const req = getLastPostedRequest(worker);

    const errorResponse: WorkerResponse<never> = {
      id: req.id,
      type: req.type,
      success: false,
      error: "relayer returned 400",
      statusCode: 400,
    };
    worker.onmessage?.(new MessageEvent("message", { data: errorResponse }));

    await expect(keypairPromise).rejects.toSatisfy((err: Error & { statusCode?: number }) => {
      return err.message === "relayer returned 400" && err.statusCode === 400;
    });

    client.terminate();
  });
});

// ===========================================================================
// NodeWorkerClient
// ===========================================================================

describe("NodeWorkerClient", () => {
  beforeEach(() => {
    lastMockNodeWorker = null;
    uuidCounter = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MockNodeWorkerClass.mockImplementation(function (this: any) {
      return createMockNodeWorker();
    });
    nodeUuidFn.mockImplementation(() => `node-uuid-${++uuidCounter}`);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createWorker() creates a Node.js Worker from node:worker_threads", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();

    expect(lastMockNodeWorker).not.toBeNull();
    expect(MockNodeWorkerClass).toHaveBeenCalledOnce();

    client.terminate();
  });

  it("wireEvents() uses worker.on() for message, error, messageerror", () => {
    const client = new NodeWorkerClient(defaultNodeConfig());
    client.initWorker();

    const worker = lastMockNodeWorker!;
    expect(worker.on).toHaveBeenCalledWith("message", expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(worker.on).toHaveBeenCalledWith("messageerror", expect.any(Function));

    // Clean up
    const firstCall = getFirstPostedRequest(worker);
    const handler = worker.listeners["message"]?.[0];
    handler?.({
      id: firstCall.id,
      type: firstCall.type,
      success: true,
      data: { initialized: true },
    });
    return client.initWorker().then(() => client.terminate());
  });

  it("postMessage() delegates to worker.postMessage()", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();

    expect(lastMockNodeWorker!.postMessage).toHaveBeenCalledOnce();
    const req = getFirstPostedRequest(lastMockNodeWorker!);
    expect(req.type).toBe("NODE_INIT");

    client.terminate();
  });

  it("terminateWorker() calls worker.terminate()", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();
    const worker = lastMockNodeWorker!;

    client.terminate();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("generateRequestId() uses randomUUID from node:crypto", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();

    const req = getFirstPostedRequest(lastMockNodeWorker!);
    expect(req.id).toMatch(/^node-uuid-\d+$/);

    client.terminate();
  });

  it("getInitPayload() returns NODE_INIT type with fhevmConfig", async () => {
    setupAutoResolvingNodeWorker();
    const config = defaultNodeConfig();
    const client = new NodeWorkerClient(config);
    await client.initWorker();

    const req = getFirstPostedRequest(lastMockNodeWorker!);
    expect(req.type).toBe("NODE_INIT");
    expect(req.payload).toEqual({ fhevmConfig: config.fhevmConfig });

    client.terminate();
  });

  it("onWorkerReady() calls worker.unref()", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();

    expect(lastMockNodeWorker!.unref).toHaveBeenCalledOnce();

    client.terminate();
  });

  it("message event handler dispatches response to handleResponse", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();
    const worker = lastMockNodeWorker!;

    worker.postMessage.mockImplementation(() => {});

    const keypairPromise = client.generateKeypair();
    await flush();

    const req = getLastPostedRequest(worker);
    const handler = worker.listeners["message"]?.[0];
    handler?.({
      id: req.id,
      type: req.type,
      success: true,
      data: { publicKey: "pk", privateKey: "sk" },
    } as WorkerResponse<unknown>);

    const result = await keypairPromise;
    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });

    client.terminate();
  });

  it("error event handler rejects pending requests", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();
    const worker = lastMockNodeWorker!;

    worker.postMessage.mockImplementation(() => {});

    const keypairPromise = client.generateKeypair();
    await flush();

    const errorHandler = worker.listeners["error"]?.[0];
    errorHandler?.(new Error("thread crashed"));

    await expect(keypairPromise).rejects.toThrow("Worker error: thread crashed");
  });

  it("messageerror event handler rejects pending requests", async () => {
    setupAutoResolvingNodeWorker();
    const client = new NodeWorkerClient(defaultNodeConfig());
    await client.initWorker();
    const worker = lastMockNodeWorker!;

    worker.postMessage.mockImplementation(() => {});

    const keypairPromise = client.generateKeypair();
    await flush();

    const messageerrorHandler = worker.listeners["messageerror"]?.[0];
    messageerrorHandler?.();

    await expect(keypairPromise).rejects.toThrow("Worker message deserialization failed");
  });
});
