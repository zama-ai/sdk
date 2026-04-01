import { vi } from "vitest";
import { beforeEach, describe, expect, it } from "../../test-fixtures";
import type { NodeWorkerPoolConfig } from "../worker.node-pool";
import { NodeWorkerPool } from "../worker.node-pool";
import type { ZKProofLike } from "../worker.types";

const HANDLE = ("0x" + "11".repeat(32)) as `0x${string}`;

vi.mock(import("../worker.node-client"), () => {
  const NodeWorkerClient = vi.fn().mockImplementation(function () {
    return {
      initWorker: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
      generateKeypair: vi.fn().mockResolvedValue({ publicKey: "pk", privateKey: "sk" }),
      createEIP712: vi.fn().mockResolvedValue({}),
      encrypt: vi.fn().mockResolvedValue({ handles: [], inputProof: "0x" }),
      userDecrypt: vi.fn().mockResolvedValue({ clearValues: {} }),
      publicDecrypt: vi.fn().mockResolvedValue({
        clearValues: {},
        abiEncodedClearValues: "0x",
        decryptionProof: "0x",
      }),
      createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({}),
      delegatedUserDecrypt: vi.fn().mockResolvedValue({ clearValues: {} }),
      requestZKProofVerification: vi.fn().mockResolvedValue("0x"),
      getPublicKey: vi.fn().mockResolvedValue({ result: null }),
      getPublicParams: vi.fn().mockResolvedValue({ result: null }),
    };
  });
  return { NodeWorkerClient };
});

// Must import after mock so the mock is in place
const { NodeWorkerClient } = await import("../worker.node-client");

const baseConfig = {
  fhevmConfig: { chainId: 1 },
} as unknown as NodeWorkerPoolConfig;

describe("NodeWorkerPool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses custom pool size", () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 2 });
    expect(pool.poolSize).toBe(2);
  });

  it("defaults pool size to min(availableParallelism, 4)", () => {
    const pool = new NodeWorkerPool(baseConfig);
    expect(pool.poolSize).toBeGreaterThanOrEqual(1);
    expect(pool.poolSize).toBeLessThanOrEqual(4);
  });

  it("initializes all workers in parallel", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 3 });
    await pool.initPool();

    expect(NodeWorkerClient).toHaveBeenCalledTimes(3);
    const instances = vi.mocked(NodeWorkerClient).mock.results.map((r) => r.value);
    for (const instance of instances) {
      expect(instance.initWorker).toHaveBeenCalledOnce();
    }
  });

  it("sends sequential calls to worker 0 when all are idle", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 3 });
    await pool.initPool();

    const instances = vi.mocked(NodeWorkerClient).mock.results.map((r) => r.value);

    // All resolve immediately so active count returns to 0 each time — always picks worker 0
    await pool.generateKeypair();
    await pool.generateKeypair();
    await pool.generateKeypair();

    expect(instances[0].generateKeypair).toHaveBeenCalledTimes(3);
    expect(instances[1].generateKeypair).toHaveBeenCalledTimes(0);
    expect(instances[2].generateKeypair).toHaveBeenCalledTimes(0);
  });

  it("dispatches to least-busy worker when workers are occupied", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 2 });
    await pool.initPool();

    const instances = vi.mocked(NodeWorkerClient).mock.results.map((r) => r.value);

    // Make worker 0's generateKeypair block until we resolve it
    let resolveWorker0!: (v: unknown) => void;
    instances[0].generateKeypair.mockReturnValueOnce(
      new Promise((r) => {
        resolveWorker0 = r;
      }),
    );

    // Start a long-running call on worker 0 (don't await)
    const p1 = pool.generateKeypair();

    // Now worker 0 has 1 active request, worker 1 has 0 — should go to worker 1
    await pool.generateKeypair();
    expect(instances[1].generateKeypair).toHaveBeenCalledTimes(1);

    // Resolve worker 0 to clean up
    resolveWorker0({ publicKey: "pk", privateKey: "sk" });
    await p1;
  });

  it("terminates all workers", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 2 });
    await pool.initPool();

    const instances = vi.mocked(NodeWorkerClient).mock.results.map((r) => r.value);

    pool.terminate();

    for (const instance of instances) {
      expect(instance.terminate).toHaveBeenCalledOnce();
    }
  });

  it("delegates all public methods to workers", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 1 });
    await pool.initPool();

    const instance = vi.mocked(NodeWorkerClient).mock.results[0]!.value;

    await pool.generateKeypair();
    expect(instance.generateKeypair).toHaveBeenCalled();

    await pool.createEIP712({
      publicKey: "0xpk",
      contractAddresses: ["0x1"],
      startTimestamp: 1000,
      durationDays: 7,
    });
    expect(instance.createEIP712).toHaveBeenCalledWith({
      publicKey: "0xpk",
      contractAddresses: ["0x1"],
      startTimestamp: 1000,
      durationDays: 7,
    });

    await pool.encrypt({
      values: [{ value: 1n, type: "euint8" as const }],
      contractAddress: "0xC",
      userAddress: "0xU",
    });
    expect(instance.encrypt).toHaveBeenCalledWith({
      values: [{ value: 1n, type: "euint8" as const }],
      contractAddress: "0xC",
      userAddress: "0xU",
    });

    await pool.userDecrypt({
      handles: [HANDLE],
      contractAddress: "0xC",
      signedContractAddresses: ["0xS"],
      privateKey: "0xsk",
      publicKey: "0xpk",
      signature: "0xsig",
      signerAddress: "0xA",
      startTimestamp: 100,
      durationDays: 7,
    });
    expect(instance.userDecrypt).toHaveBeenCalled();

    await pool.publicDecrypt([HANDLE]);
    expect(instance.publicDecrypt).toHaveBeenCalledWith([HANDLE]);

    await pool.createDelegatedUserDecryptEIP712({
      publicKey: "0xpk",
      contractAddresses: ["0x1"],
      delegatorAddress: "0xD",
      startTimestamp: 100,
      durationDays: 7,
    });
    expect(instance.createDelegatedUserDecryptEIP712).toHaveBeenCalled();

    await pool.delegatedUserDecrypt({
      handles: [HANDLE],
      contractAddress: "0xC",
      signedContractAddresses: ["0xS"],
      privateKey: "0xsk",
      publicKey: "0xpk",
      signature: "0xsig",
      delegatorAddress: "0xD",
      delegateAddress: "0xE",
      startTimestamp: 100,
      durationDays: 7,
    });
    expect(instance.delegatedUserDecrypt).toHaveBeenCalled();

    await pool.requestZKProofVerification({} as unknown as ZKProofLike);
    expect(instance.requestZKProofVerification).toHaveBeenCalled();

    await pool.getPublicKey();
    expect(instance.getPublicKey).toHaveBeenCalled();

    await pool.getPublicParams(2048);
    expect(instance.getPublicParams).toHaveBeenCalledWith(2048);
  });

  it("clears workers and active counts on terminate", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 2 });
    await pool.initPool();
    pool.terminate();

    // Re-init creates fresh workers
    await pool.initPool();
    const newInstances = vi
      .mocked(NodeWorkerClient)
      .mock.results.slice(2)
      .map((r) => r.value);

    await pool.generateKeypair();
    expect(newInstances[0].generateKeypair).toHaveBeenCalledTimes(1);
  });

  it("decrements active count even when the task rejects", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 2 });
    await pool.initPool();

    const instances = vi.mocked(NodeWorkerClient).mock.results.map((r) => r.value);
    instances[0].generateKeypair.mockRejectedValueOnce(new Error("boom"));

    await pool.generateKeypair().catch(() => {});

    // Active count for worker 0 should be back to 0, so next call goes to worker 0 again
    await pool.generateKeypair();
    expect(instances[0].generateKeypair).toHaveBeenCalledTimes(2);
  });

  it("throws when dispatching without init", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 1 });
    await expect(pool.generateKeypair()).rejects.toThrow(
      "NodeWorkerPool not initialized. Call initPool() first.",
    );
  });

  it("concurrent initPool calls share the same promise", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 1 });

    await Promise.all([pool.initPool(), pool.initPool()]);

    expect(NodeWorkerClient).toHaveBeenCalledTimes(1);
  });

  it("initPool is idempotent after completion", async () => {
    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 1 });

    await pool.initPool();
    await pool.initPool();

    expect(NodeWorkerClient).toHaveBeenCalledTimes(1);
  });

  it("cleans up all workers when init fails and allows re-init", async () => {
    const terminateFns: ReturnType<typeof vi.fn>[] = [];

    vi.mocked(NodeWorkerClient).mockImplementation(function () {
      const terminateFn = vi.fn();
      terminateFns.push(terminateFn);
      return {
        initWorker: vi.fn().mockImplementation(() => {
          if (terminateFns.length > 1) {
            return Promise.reject(new Error("init failed"));
          }
          return Promise.resolve(undefined);
        }),
        terminate: terminateFn,
        generateKeypair: vi.fn(),
      } as never;
    });

    const pool = new NodeWorkerPool({ ...baseConfig, poolSize: 2 });

    await expect(pool.initPool()).rejects.toThrow("init failed");

    for (const fn of terminateFns) {
      expect(fn).toHaveBeenCalledOnce();
    }

    // Can re-init after failure
    vi.mocked(NodeWorkerClient).mockImplementation(function () {
      return {
        initWorker: vi.fn().mockResolvedValue(undefined),
        terminate: vi.fn(),
        generateKeypair: vi.fn().mockResolvedValue({ publicKey: "pk", privateKey: "sk" }),
      } as never;
    });

    await pool.initPool();
    await expect(pool.generateKeypair()).resolves.toBeDefined();
  });
});
