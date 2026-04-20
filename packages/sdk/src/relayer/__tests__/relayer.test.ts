import { vi } from "vitest";
import { ConfigurationError, EncryptionFailedError } from "../../errors";
import { MemoryStorage } from "../../storage/memory-storage";
import { afterEach, beforeEach, describe, expect, it } from "../../test-fixtures";

// ---------------------------------------------------------------------------
// Hoisted mocks (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockWorkerClient, MockRelayerWorkerClient, mockPool, MockNodeWorkerPool } = vi.hoisted(
  () => {
    const mockWorkerClient = {
      initWorker: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
      updateCsrf: vi.fn().mockResolvedValue(undefined),
      generateKeypair: vi.fn(),
      createEIP712: vi.fn(),
      encrypt: vi.fn(),
      userDecrypt: vi.fn(),
      publicDecrypt: vi.fn(),
      createDelegatedUserDecryptEIP712: vi.fn(),
      delegatedUserDecrypt: vi.fn(),
      requestZKProofVerification: vi.fn(),
      getPublicKey: vi.fn(),
      getPublicParams: vi.fn(),
    };

    const MockRelayerWorkerClient = vi.fn(function () {
      return mockWorkerClient;
    });

    const mockPool = {
      initPool: vi.fn().mockResolvedValue(undefined),
      terminate: vi.fn(),
      generateKeypair: vi.fn(),
      createEIP712: vi.fn(),
      encrypt: vi.fn(),
      userDecrypt: vi.fn(),
      publicDecrypt: vi.fn(),
      createDelegatedUserDecryptEIP712: vi.fn(),
      delegatedUserDecrypt: vi.fn(),
      requestZKProofVerification: vi.fn(),
      getPublicKey: vi.fn(),
      getPublicParams: vi.fn(),
    };

    const MockNodeWorkerPool = vi.fn(function () {
      return mockPool;
    });

    return {
      mockWorkerClient,
      MockRelayerWorkerClient,
      mockPool,
      MockNodeWorkerPool,
    };
  },
);

vi.mock("../../worker/worker.client", () => ({
  RelayerWorkerClient: MockRelayerWorkerClient,
}));

vi.mock("../../worker/worker.node-pool", () => ({
  NodeWorkerPool: MockNodeWorkerPool,
}));

// ---------------------------------------------------------------------------
// Imports under test (must come after vi.mock)
// ---------------------------------------------------------------------------

import { RelayerWorkerClient } from "../../worker/worker.client";
import { NodeWorkerPool } from "../../worker/worker.node-pool";
import { RelayerNode } from "../relayer-node";
import { RelayerWeb } from "../relayer-web";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CHAIN_CONFIG = {
  chainId: 11155111,
  relayerUrl: "https://relayer.example.com",
} as any;

function createWebRelayer(
  overrides: Partial<ConstructorParameters<typeof RelayerWeb>[0]> = {},
): RelayerWeb {
  return new RelayerWeb({
    chain: CHAIN_CONFIG,
    // Override default IndexedDBStorage with per-test MemoryStorage for isolation
    fheArtifactStorage: new MemoryStorage(),
    ...overrides,
  });
}

function createNodeRelayer(
  overrides: Partial<ConstructorParameters<typeof RelayerNode>[0]> = {},
): RelayerNode {
  return new RelayerNode({
    chain: CHAIN_CONFIG,
    ...overrides,
  });
}

function resetMocks(): void {
  vi.clearAllMocks();
  mockWorkerClient.initWorker.mockResolvedValue(undefined);
  mockPool.initPool.mockResolvedValue(undefined);
}

// ---------------------------------------------------------------------------
// Shared EIP712 mock data
// ---------------------------------------------------------------------------

const MOCK_EIP712 = {
  domain: {
    name: "test",
    version: "1",
    chainId: 11155111,
    verifyingContract: "0xABC" as `0x${string}`,
  },
  types: {
    UserDecryptRequestVerification: [{ name: "publicKey", type: "bytes" }],
  },
  message: {
    publicKey: "0xpub",
    contractAddresses: ["0x123"],
    startTimestamp: 1000n,
    durationDays: 7n,
    extraData: "0x",
  },
};

const HANDLE = ("0x" + "11".repeat(32)) as `0x${string}`;

// ===========================================================================
// RelayerWeb
// ===========================================================================

describe("RelayerWeb", () => {
  beforeEach(resetMocks);

  // -------------------------------------------------------------------------
  // Lazy initialization
  // -------------------------------------------------------------------------

  describe("lazy initialization", () => {
    it("creates the worker on first method call", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();

      expect(RelayerWorkerClient).toHaveBeenCalledOnce();
      expect(mockWorkerClient.initWorker).toHaveBeenCalledOnce();
    });

    it("reuses the same worker across multiple calls", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      await relayer.generateKeypair();

      expect(RelayerWorkerClient).toHaveBeenCalledOnce();
      expect(mockWorkerClient.initWorker).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Terminated state
  // -------------------------------------------------------------------------

  describe("terminate", () => {
    it("terminates the worker and auto-restarts on next call", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      relayer.terminate();

      expect(mockWorkerClient.terminate).toHaveBeenCalledOnce();

      // After terminate, subsequent calls auto-restart the worker
      const result = await relayer.generateKeypair();
      expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
    });

    it("is safe to call terminate before any initialization", () => {
      const relayer = createWebRelayer();
      expect(() => relayer.terminate()).not.toThrow();
    });

    it("[Symbol.dispose] delegates to terminate", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });
      await relayer.generateKeypair();

      relayer[Symbol.dispose]();
      expect(mockWorkerClient.terminate).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Init error handling
  // -------------------------------------------------------------------------

  describe("initialization errors", () => {
    it("wraps non-ZamaError init failures in ConfigurationError", async () => {
      mockWorkerClient.initWorker.mockRejectedValueOnce(new Error("WASM load failed"));
      const relayer = createWebRelayer();

      const promise = relayer.generateKeypair();
      await expect(promise).rejects.toThrow(ConfigurationError);
      await expect(promise).rejects.toThrow("Failed to initialize FHE worker");
    });

    it("passes through ZamaError from init without re-wrapping", async () => {
      const tokenError = new EncryptionFailedError("already an SDK error");
      mockWorkerClient.initWorker.mockRejectedValueOnce(tokenError);
      const relayer = createWebRelayer();

      await expect(relayer.generateKeypair()).rejects.toBe(tokenError);
    });

    it("allows retry after init failure", async () => {
      mockWorkerClient.initWorker
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce(undefined);
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      const relayer = createWebRelayer();

      await expect(relayer.generateKeypair()).rejects.toThrow();

      const result = await relayer.generateKeypair();
      expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
    });
  });

  // -------------------------------------------------------------------------
  // CSRF token refresh
  // -------------------------------------------------------------------------

  describe("CSRF token refresh", () => {
    it("refreshes CSRF token before encrypt", async () => {
      const getCsrfToken = vi.fn().mockReturnValue("csrf-token-123");
      const relayer = createWebRelayer({ security: { getCsrfToken } });
      mockWorkerClient.encrypt.mockResolvedValue({
        handles: [],
        inputProof: new Uint8Array(),
      });

      await relayer.encrypt({
        values: [{ value: 100n, type: "euint64" as const }],
        contractAddress: "0xContract" as `0x${string}`,
        userAddress: "0xUser" as `0x${string}`,
      });

      expect(mockWorkerClient.updateCsrf).toHaveBeenCalledWith("csrf-token-123");
    });

    it("skips CSRF refresh when getCsrfToken is not provided", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.encrypt.mockResolvedValue({
        handles: [],
        inputProof: new Uint8Array(),
      });

      await relayer.encrypt({
        values: [{ value: 100n, type: "euint64" as const }],
        contractAddress: "0xContract" as `0x${string}`,
        userAddress: "0xUser" as `0x${string}`,
      });

      expect(mockWorkerClient.updateCsrf).not.toHaveBeenCalled();
    });

    it("skips CSRF refresh when token is empty", async () => {
      const getCsrfToken = vi.fn().mockReturnValue("");
      const relayer = createWebRelayer({ security: { getCsrfToken } });
      mockWorkerClient.encrypt.mockResolvedValue({
        handles: [],
        inputProof: new Uint8Array(),
      });

      await relayer.encrypt({
        values: [{ value: 100n, type: "euint64" as const }],
        contractAddress: "0xContract" as `0x${string}`,
        userAddress: "0xUser" as `0x${string}`,
      });

      expect(mockWorkerClient.updateCsrf).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Method delegation
  // -------------------------------------------------------------------------

  describe("method delegation", () => {
    it("generateKeypair delegates to worker", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pub",
        privateKey: "priv",
      });

      const result = await relayer.generateKeypair();

      expect(result).toEqual({ publicKey: "pub", privateKey: "priv" });
      expect(mockWorkerClient.generateKeypair).toHaveBeenCalledOnce();
    });

    it("createEIP712 delegates to worker with correct params", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.createEIP712.mockResolvedValue(MOCK_EIP712);

      const result = await relayer.createEIP712("0xpub", ["0x123" as `0x${string}`], 1000, 7);

      expect(mockWorkerClient.createEIP712).toHaveBeenCalledWith({
        publicKey: "0xpub",
        contractAddresses: ["0x123"],
        startTimestamp: 1000,
        durationDays: 7,
      });
      expect(result.domain.name).toBe("test");
      expect(result.message.publicKey).toBe("0xpub");
    });

    it("encrypt delegates to worker and returns handles + inputProof", async () => {
      const relayer = createWebRelayer();
      const handles = [new Uint8Array([1, 2])];
      const inputProof = new Uint8Array([3, 4]);
      mockWorkerClient.encrypt.mockResolvedValue({ handles, inputProof });

      const result = await relayer.encrypt({
        values: [{ value: 42n, type: "euint64" as const }],
        contractAddress: "0xC" as `0x${string}`,
        userAddress: "0xU" as `0x${string}`,
      });

      expect(result).toEqual({ handles, inputProof });
    });

    it("userDecrypt delegates to worker and returns clearValues", async () => {
      const relayer = createWebRelayer();
      const clearValues = { [HANDLE]: 100n };
      mockWorkerClient.userDecrypt.mockResolvedValue({ clearValues });

      const params = {
        handles: [HANDLE],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "0xsk" as `0x${string}`,
        publicKey: "0xpk" as `0x${string}`,
        signature: "0xsig" as `0x${string}`,
        signerAddress: "0xS" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.userDecrypt(params);

      expect(result).toEqual(clearValues);
      expect(mockWorkerClient.userDecrypt).toHaveBeenCalledWith(params);
    });

    it("publicDecrypt delegates to worker and returns structured result", async () => {
      const relayer = createWebRelayer();
      const mockResult = {
        clearValues: {
          [HANDLE]: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
          [("0x" + "22".repeat(32)) as `0x${string}`]: true,
        },
        abiEncodedClearValues: "0xencoded",
        decryptionProof: "0xproof" as `0x${string}`,
      };
      mockWorkerClient.publicDecrypt.mockResolvedValue(mockResult);

      const result = await relayer.publicDecrypt([HANDLE]);

      expect(result).toEqual(mockResult);
      expect(mockWorkerClient.publicDecrypt).toHaveBeenCalledWith([HANDLE]);
    });

    it("createDelegatedUserDecryptEIP712 delegates to worker", async () => {
      const relayer = createWebRelayer();
      const mockData = { some: "eip712data" };
      mockWorkerClient.createDelegatedUserDecryptEIP712.mockResolvedValue(mockData);

      const result = await relayer.createDelegatedUserDecryptEIP712(
        "0xpk",
        ["0xC" as `0x${string}`],
        "0xDelegator",
        1000,
        7,
      );

      expect(result).toBe(mockData);
      expect(mockWorkerClient.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith({
        publicKey: "0xpk",
        contractAddresses: ["0xC"],
        delegatorAddress: "0xDelegator",
        startTimestamp: 1000,
        durationDays: 7,
      });
    });

    it("delegatedUserDecrypt delegates to worker and returns clearValues", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.delegatedUserDecrypt.mockResolvedValue({
        clearValues: { [HANDLE]: 200n },
      });

      const params = {
        handles: [HANDLE],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "0xsk" as `0x${string}`,
        publicKey: "0xpk" as `0x${string}`,
        signature: "0xsig" as `0x${string}`,
        delegatorAddress: "0xD" as `0x${string}`,
        delegateAddress: "0xE" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.delegatedUserDecrypt(params);

      expect(result).toEqual({ [HANDLE]: 200n });
    });

    it("requestZKProofVerification delegates to worker", async () => {
      const relayer = createWebRelayer();
      const proof = new Uint8Array([1, 2, 3]);
      mockWorkerClient.requestZKProofVerification.mockResolvedValue(proof);

      const zkProof = { proof: "data" } as unknown as Parameters<
        typeof relayer.requestZKProofVerification
      >[0];
      const result = await relayer.requestZKProofVerification(zkProof);

      expect(result).toBe(proof);
    });

    it("getPublicKey delegates to worker and unwraps result", async () => {
      const relayer = createWebRelayer();
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([5]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      const result = await relayer.getPublicKey();

      expect(result).toEqual(pk);
    });

    it("getPublicKey returns null when worker returns null result", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: null });

      const result = await relayer.getPublicKey();

      expect(result).toBeNull();
    });

    it("getPublicParams delegates to worker and unwraps result", async () => {
      const relayer = createWebRelayer();
      const pp = { publicParams: new Uint8Array([9]), publicParamsId: "pp1" };
      mockWorkerClient.getPublicParams.mockResolvedValue({ result: pp });

      const result = await relayer.getPublicParams(2048);

      expect(result).toEqual(pp);
      expect(mockWorkerClient.getPublicParams).toHaveBeenCalledWith(2048);
    });
  });

  // -------------------------------------------------------------------------
  // SDK-17: Status tracking
  // -------------------------------------------------------------------------

  describe("status tracking", () => {
    it("starts in idle state", () => {
      const relayer = createWebRelayer();
      expect(relayer.status).toBe("idle");
      expect(relayer.initError).toBeUndefined();
    });

    it("transitions to ready after successful init", async () => {
      const onStatusChange = vi.fn();
      const relayer = createWebRelayer({ onStatusChange });
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();

      expect(relayer.status).toBe("ready");
      expect(onStatusChange).toHaveBeenCalledWith("initializing", undefined);
      expect(onStatusChange).toHaveBeenCalledWith("ready", undefined);
    });

    it("transitions to error when init fails", async () => {
      const onStatusChange = vi.fn();
      const relayer = createWebRelayer({ onStatusChange });
      mockWorkerClient.initWorker.mockRejectedValue(new Error("WASM failed"));

      await expect(relayer.generateKeypair()).rejects.toThrow("Failed to initialize FHE worker");

      expect(relayer.status).toBe("error");
      expect(relayer.initError).toBeInstanceOf(Error);
      expect(onStatusChange).toHaveBeenCalledWith("error", expect.any(Error));
    });
  });

  // -------------------------------------------------------------------------
  // Persistent caching integration
  // -------------------------------------------------------------------------

  describe("persistent caching", () => {
    it("caches getPublicKey when storage is provided", async () => {
      const storage = new MemoryStorage();
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1, 2, 3]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createWebRelayer({ fheArtifactStorage: storage });
      const result = await relayer.getPublicKey();
      expect(result).toEqual(pk);
      expect(mockWorkerClient.getPublicKey).toHaveBeenCalledOnce();

      // Second call — served from cache, worker not called again
      const result2 = await relayer.getPublicKey();
      expect(result2).toEqual(pk);
      expect(mockWorkerClient.getPublicKey).toHaveBeenCalledOnce();
    });

    it("caches getPublicParams when storage is provided", async () => {
      const storage = new MemoryStorage();
      const pp = {
        publicParamsId: "pp-1",
        publicParams: new Uint8Array([4, 5]),
      };
      mockWorkerClient.getPublicParams.mockResolvedValue({ result: pp });

      const relayer = createWebRelayer({ fheArtifactStorage: storage });
      const result = await relayer.getPublicParams(2048);
      expect(result).toEqual(pp);
      expect(mockWorkerClient.getPublicParams).toHaveBeenCalledOnce();

      const result2 = await relayer.getPublicParams(2048);
      expect(result2).toEqual(pp);
      expect(mockWorkerClient.getPublicParams).toHaveBeenCalledOnce();
    });

    it("restores cache across instances from persistent storage", async () => {
      const storage = new MemoryStorage();
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([10]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      // First instance — fetches and persists
      const relayer1 = createWebRelayer({ fheArtifactStorage: storage });
      await relayer1.getPublicKey();
      relayer1.terminate();

      // Second instance — restores from storage without worker call
      resetMocks();
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: null });
      const relayer2 = createWebRelayer({ fheArtifactStorage: storage });
      const result = await relayer2.getPublicKey();
      expect(result).toEqual(pk);
      expect(mockWorkerClient.getPublicKey).not.toHaveBeenCalled();
    });

    it("caches by default even when no storage is explicitly provided", async () => {
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createWebRelayer();
      await relayer.getPublicKey();
      await relayer.getPublicKey();

      // Caching is always on — worker called only once
      expect(mockWorkerClient.getPublicKey).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Revalidation integration
  // -------------------------------------------------------------------------

  describe("revalidation", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("tears down worker when revalidation detects stale artifacts", async () => {
      const storage = new MemoryStorage();
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createWebRelayer({
        fheArtifactStorage: storage,
        fheArtifactCacheTTL: 0,
      });

      // First call — init worker, fetch and cache pk
      await relayer.getPublicKey();
      expect(RelayerWorkerClient).toHaveBeenCalledTimes(1);

      // Seed artifact metadata + force expired timestamp so revalidation
      // issues a conditional GET instead of just capturing validators.
      const pkKey = "fhe:pubkey:11155111";
      const cached = await storage.get<Record<string, unknown>>(pkKey);
      if (cached) {
        cached.lastValidatedAt = 0;
        cached.artifactUrl = "https://cdn.example.com/pk.bin";
        cached.etag = '"pk-etag-1"';
        await storage.set(pkKey, cached);
      }

      // Mock fetch for revalidation: manifest + artifact returns 200 (changed)
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url;
        if (urlStr.includes("/keyurl")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                status: "succeeded",
                response: {
                  fheKeyInfo: [
                    {
                      fhePublicKey: {
                        urls: ["https://cdn.example.com/pk.bin"],
                      },
                    },
                  ],
                  crs: {},
                },
              }),
          });
        }
        if (urlStr.includes("pk.bin")) {
          return Promise.resolve({
            status: 200,
            ok: true,
            headers: new Headers({ etag: '"pk-etag-ROTATED"' }),
            body: null,
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      // Next call triggers revalidation → stale → worker teardown + re-init
      const pk2 = { publicKeyId: "pk-2", publicKey: new Uint8Array([2]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk2 });
      const result = await relayer.getPublicKey();

      // Worker was re-created (2nd time)
      expect(RelayerWorkerClient).toHaveBeenCalledTimes(2);
      expect(result).toEqual(pk2);
    });

    it("does not teardown when revalidation finds fresh artifacts", async () => {
      const storage = new MemoryStorage();
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createWebRelayer({
        fheArtifactStorage: storage,
        fheArtifactCacheTTL: 86_400,
      });

      // First call — init worker, fetch and cache pk
      await relayer.getPublicKey();
      expect(RelayerWorkerClient).toHaveBeenCalledTimes(1);

      // No fetch mock needed — interval hasn't elapsed, so no revalidation
      // Second call reuses same worker
      await relayer.getPublicKey();
      expect(RelayerWorkerClient).toHaveBeenCalledTimes(1);
      expect(mockWorkerClient.terminate).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// RelayerNode
// ===========================================================================

describe("RelayerNode", () => {
  beforeEach(resetMocks);

  // -------------------------------------------------------------------------
  // Lazy initialization
  // -------------------------------------------------------------------------

  describe("lazy initialization", () => {
    it("creates the pool on first method call", async () => {
      const relayer = createNodeRelayer();
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();

      expect(NodeWorkerPool).toHaveBeenCalledOnce();
      expect(mockPool.initPool).toHaveBeenCalledOnce();
    });

    it("reuses the same pool across multiple calls", async () => {
      const relayer = createNodeRelayer();
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      await relayer.generateKeypair();

      expect(NodeWorkerPool).toHaveBeenCalledOnce();
      expect(mockPool.initPool).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Chain ID change detection
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Terminated state
  // -------------------------------------------------------------------------

  describe("terminate", () => {
    it("terminates the pool and rejects subsequent calls", async () => {
      const relayer = createNodeRelayer();
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      relayer.terminate();

      expect(mockPool.terminate).toHaveBeenCalledOnce();

      await expect(relayer.generateKeypair()).rejects.toThrow(ConfigurationError);
      await expect(relayer.generateKeypair()).rejects.toThrow("RelayerNode has been terminated");
    });

    it("is safe to call terminate before any initialization", () => {
      const relayer = createNodeRelayer();
      expect(() => relayer.terminate()).not.toThrow();
    });

    it("[Symbol.dispose] delegates to terminate", async () => {
      const relayer = createNodeRelayer();
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });
      await relayer.generateKeypair();

      relayer[Symbol.dispose]();
      expect(mockPool.terminate).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Init error handling
  // -------------------------------------------------------------------------

  describe("initialization errors", () => {
    it("wraps non-ZamaError init failures in ConfigurationError", async () => {
      mockPool.initPool.mockRejectedValueOnce(new Error("pool init failed"));
      const relayer = createNodeRelayer();

      const promise = relayer.generateKeypair();
      await expect(promise).rejects.toThrow(ConfigurationError);
      await expect(promise).rejects.toThrow("Failed to initialize FHE worker pool");
    });

    it("passes through ZamaError from init without re-wrapping", async () => {
      const tokenError = new EncryptionFailedError("already an SDK error");
      mockPool.initPool.mockRejectedValueOnce(tokenError);
      const relayer = createNodeRelayer();

      await expect(relayer.generateKeypair()).rejects.toBe(tokenError);
    });

    it("allows retry after init failure", async () => {
      mockPool.initPool
        .mockRejectedValueOnce(new Error("transient"))
        .mockResolvedValueOnce(undefined);
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      const relayer = createNodeRelayer();

      await expect(relayer.generateKeypair()).rejects.toThrow();

      const result = await relayer.generateKeypair();
      expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
    });
  });

  // -------------------------------------------------------------------------
  // Method delegation
  // -------------------------------------------------------------------------

  describe("method delegation", () => {
    it("generateKeypair delegates to pool", async () => {
      const relayer = createNodeRelayer();
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pub",
        privateKey: "priv",
      });

      const result = await relayer.generateKeypair();

      expect(result).toEqual({ publicKey: "pub", privateKey: "priv" });
      expect(mockPool.generateKeypair).toHaveBeenCalledOnce();
    });

    it("createEIP712 delegates to pool with correct params", async () => {
      const relayer = createNodeRelayer();
      mockPool.createEIP712.mockResolvedValue(MOCK_EIP712);

      const result = await relayer.createEIP712("0xpub", ["0x123" as `0x${string}`], 1000, 7);

      expect(mockPool.createEIP712).toHaveBeenCalledWith({
        publicKey: "0xpub",
        contractAddresses: ["0x123"],
        startTimestamp: 1000,
        durationDays: 7,
      });
      expect(result.domain.name).toBe("test");
      expect(result.message.publicKey).toBe("0xpub");
    });

    it("encrypt delegates to pool and returns handles + inputProof", async () => {
      const relayer = createNodeRelayer();
      const handles = [new Uint8Array([1, 2])];
      const inputProof = new Uint8Array([3, 4]);
      mockPool.encrypt.mockResolvedValue({ handles, inputProof });

      const result = await relayer.encrypt({
        values: [{ value: 42n, type: "euint64" as const }],
        contractAddress: "0xC" as `0x${string}`,
        userAddress: "0xU" as `0x${string}`,
      });

      expect(result).toEqual({ handles, inputProof });
    });

    it("userDecrypt delegates to pool and returns clearValues", async () => {
      const relayer = createNodeRelayer();
      const clearValues = { [HANDLE]: 100n };
      mockPool.userDecrypt.mockResolvedValue({ clearValues });

      const params = {
        handles: [HANDLE],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "0xsk" as `0x${string}`,
        publicKey: "0xpk" as `0x${string}`,
        signature: "0xsig" as `0x${string}`,
        signerAddress: "0xS" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.userDecrypt(params);

      expect(result).toEqual(clearValues);
      expect(mockPool.userDecrypt).toHaveBeenCalledWith(params);
    });

    it("publicDecrypt delegates to pool and returns structured result", async () => {
      const relayer = createNodeRelayer();
      const mockResult = {
        clearValues: {
          [HANDLE]: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
          [("0x" + "22".repeat(32)) as `0x${string}`]: true,
        },
        abiEncodedClearValues: "0xencoded",
        decryptionProof: "0xproof" as `0x${string}`,
      };
      mockPool.publicDecrypt.mockResolvedValue(mockResult);

      const result = await relayer.publicDecrypt([HANDLE]);

      expect(result).toEqual(mockResult);
      expect(mockPool.publicDecrypt).toHaveBeenCalledWith([HANDLE]);
    });

    it("createDelegatedUserDecryptEIP712 delegates to pool", async () => {
      const relayer = createNodeRelayer();
      const mockData = { some: "eip712data" };
      mockPool.createDelegatedUserDecryptEIP712.mockResolvedValue(mockData);

      const result = await relayer.createDelegatedUserDecryptEIP712(
        "0xpk",
        ["0xC" as `0x${string}`],
        "0xDelegator",
        1000,
        7,
      );

      expect(result).toBe(mockData);
      expect(mockPool.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith({
        publicKey: "0xpk",
        contractAddresses: ["0xC"],
        delegatorAddress: "0xDelegator",
        startTimestamp: 1000,
        durationDays: 7,
      });
    });

    it("delegatedUserDecrypt delegates to pool and returns clearValues", async () => {
      const relayer = createNodeRelayer();
      mockPool.delegatedUserDecrypt.mockResolvedValue({
        clearValues: { [HANDLE]: 200n },
      });

      const params = {
        handles: [HANDLE],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "0xsk" as `0x${string}`,
        publicKey: "0xpk" as `0x${string}`,
        signature: "0xsig" as `0x${string}`,
        delegatorAddress: "0xD" as `0x${string}`,
        delegateAddress: "0xE" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.delegatedUserDecrypt(params);

      expect(result).toEqual({ [HANDLE]: 200n });
    });

    it("requestZKProofVerification delegates to pool", async () => {
      const relayer = createNodeRelayer();
      const proof = new Uint8Array([1, 2, 3]);
      mockPool.requestZKProofVerification.mockResolvedValue(proof);

      const zkProof = { proof: "data" } as unknown as Parameters<
        typeof relayer.requestZKProofVerification
      >[0];
      const result = await relayer.requestZKProofVerification(zkProof);

      expect(result).toBe(proof);
    });

    it("getPublicKey delegates to pool and unwraps result", async () => {
      const relayer = createNodeRelayer();
      const pk = { publicKeyId: "id1", publicKey: new Uint8Array([5]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk });

      const result = await relayer.getPublicKey();

      expect(result).toEqual(pk);
    });

    it("getPublicKey returns null when pool returns null result", async () => {
      const relayer = createNodeRelayer();
      mockPool.getPublicKey.mockResolvedValue({ result: null });

      const result = await relayer.getPublicKey();

      expect(result).toBeNull();
    });

    it("getPublicParams delegates to pool and unwraps result", async () => {
      const relayer = createNodeRelayer();
      const pp = { publicParams: new Uint8Array([9]), publicParamsId: "pp1" };
      mockPool.getPublicParams.mockResolvedValue({ result: pp });

      const result = await relayer.getPublicParams(2048);

      expect(result).toEqual(pp);
      expect(mockPool.getPublicParams).toHaveBeenCalledWith(2048);
    });
  });

  // -------------------------------------------------------------------------
  // Persistent caching integration
  // -------------------------------------------------------------------------

  describe("persistent caching", () => {
    it("caches getPublicKey when storage is provided", async () => {
      const storage = new MemoryStorage();
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1, 2, 3]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createNodeRelayer({ fheArtifactStorage: storage });
      const result = await relayer.getPublicKey();
      expect(result).toEqual(pk);
      expect(mockPool.getPublicKey).toHaveBeenCalledOnce();

      // Second call — served from cache
      const result2 = await relayer.getPublicKey();
      expect(result2).toEqual(pk);
      expect(mockPool.getPublicKey).toHaveBeenCalledOnce();
    });

    it("caches getPublicParams when storage is provided", async () => {
      const storage = new MemoryStorage();
      const pp = {
        publicParamsId: "pp-1",
        publicParams: new Uint8Array([4, 5]),
      };
      mockPool.getPublicParams.mockResolvedValue({ result: pp });

      const relayer = createNodeRelayer({ fheArtifactStorage: storage });
      const result = await relayer.getPublicParams(2048);
      expect(result).toEqual(pp);
      expect(mockPool.getPublicParams).toHaveBeenCalledOnce();

      const result2 = await relayer.getPublicParams(2048);
      expect(result2).toEqual(pp);
      expect(mockPool.getPublicParams).toHaveBeenCalledOnce();
    });

    it("caches getPublicKey when storage is not provided (MemoryStorage fallback)", async () => {
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createNodeRelayer(); // no storage
      await relayer.getPublicKey();
      await relayer.getPublicKey();

      expect(mockPool.getPublicKey).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Revalidation integration
  // -------------------------------------------------------------------------

  describe("revalidation", () => {
    let originalFetch: typeof globalThis.fetch;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it("tears down pool when revalidation detects stale artifacts", async () => {
      const storage = new MemoryStorage();
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createNodeRelayer({
        fheArtifactStorage: storage,
        fheArtifactCacheTTL: 0,
      });

      // First call — init pool, fetch and cache pk
      await relayer.getPublicKey();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(1);

      // Seed artifact metadata + force expired timestamp
      const pkKey = "fhe:pubkey:11155111";
      const cached = await storage.get<Record<string, unknown>>(pkKey);
      if (cached) {
        cached.lastValidatedAt = 0;
        cached.artifactUrl = "https://cdn.example.com/pk.bin";
        cached.etag = '"pk-etag-1"';
        await storage.set(pkKey, cached);
      }

      // Mock fetch: manifest + artifact returns 200 (changed)
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        const urlStr = url;
        if (urlStr.includes("/keyurl")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                status: "succeeded",
                response: {
                  fheKeyInfo: [
                    {
                      fhePublicKey: {
                        urls: ["https://cdn.example.com/pk.bin"],
                      },
                    },
                  ],
                  crs: {},
                },
              }),
          });
        }
        if (urlStr.includes("pk.bin")) {
          return Promise.resolve({
            status: 200,
            ok: true,
            headers: new Headers({ etag: '"pk-etag-ROTATED"' }),
            body: null,
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      // Next call triggers revalidation → stale → pool teardown + re-init
      const pk2 = { publicKeyId: "pk-2", publicKey: new Uint8Array([2]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk2 });
      const result = await relayer.getPublicKey();

      expect(NodeWorkerPool).toHaveBeenCalledTimes(2);
      expect(result).toEqual(pk2);
    });

    it("does not teardown when revalidation finds fresh artifacts", async () => {
      const storage = new MemoryStorage();
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createNodeRelayer({
        fheArtifactStorage: storage,
        fheArtifactCacheTTL: 86_400,
      });

      await relayer.getPublicKey();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(1);

      // Interval hasn't elapsed — no revalidation, same pool
      await relayer.getPublicKey();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(1);
      expect(mockPool.terminate).not.toHaveBeenCalled();
    });
  });
});
