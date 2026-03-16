import { vi } from "vitest";
import { afterEach, describe, it, expect, beforeEach } from "../../test-fixtures";
import { EncryptionFailedError } from "../../token/errors";
import { MemoryStorage } from "../../token/memory-storage";

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

    return { mockWorkerClient, MockRelayerWorkerClient, mockPool, MockNodeWorkerPool };
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

import { RelayerWeb } from "../relayer-web";
import { RelayerNode } from "../relayer-node";
import { RelayerWorkerClient } from "../../worker/worker.client";
import { NodeWorkerPool } from "../../worker/worker.node-pool";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CHAIN_ID = 11155111;
const TRANSPORTS = {
  [CHAIN_ID]: { relayerUrl: "https://relayer.example.com" },
};

function createWebRelayer(
  overrides: Partial<ConstructorParameters<typeof RelayerWeb>[0]> = {},
): RelayerWeb {
  return new RelayerWeb({
    getChainId: vi.fn().mockResolvedValue(CHAIN_ID),
    transports: TRANSPORTS,
    ...overrides,
  });
}

function createNodeRelayer(
  overrides: Partial<ConstructorParameters<typeof RelayerNode>[0]> = {},
): RelayerNode {
  return new RelayerNode({
    getChainId: vi.fn().mockResolvedValue(CHAIN_ID),
    transports: TRANSPORTS,
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
    chainId: CHAIN_ID,
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
  // Chain ID change detection
  // -------------------------------------------------------------------------

  describe("chain ID change", () => {
    it("re-initializes the worker when chain ID changes", async () => {
      const getChainId = vi.fn().mockResolvedValue(CHAIN_ID);
      const relayer = createWebRelayer({ getChainId });
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      expect(RelayerWorkerClient).toHaveBeenCalledTimes(1);

      // Switch chain
      getChainId.mockResolvedValue(1);
      await relayer.generateKeypair();

      expect(mockWorkerClient.terminate).toHaveBeenCalledOnce();
      expect(RelayerWorkerClient).toHaveBeenCalledTimes(2);
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
  });

  // -------------------------------------------------------------------------
  // Init error handling
  // -------------------------------------------------------------------------

  describe("initialization errors", () => {
    it("wraps non-ZamaError init failures in EncryptionFailedError", async () => {
      mockWorkerClient.initWorker.mockRejectedValueOnce(new Error("WASM load failed"));
      const relayer = createWebRelayer();

      const promise = relayer.generateKeypair();
      await expect(promise).rejects.toThrow(EncryptionFailedError);
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

      const relayer = createWebRelayer({ storage });
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
      const pp = { publicParamsId: "pp-1", publicParams: new Uint8Array([4, 5]) };
      mockWorkerClient.getPublicParams.mockResolvedValue({ result: pp });

      const relayer = createWebRelayer({ storage });
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
      const relayer1 = createWebRelayer({ storage });
      await relayer1.getPublicKey();
      relayer1.terminate();

      // Second instance — restores from storage without worker call
      resetMocks();
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: null });
      const relayer2 = createWebRelayer({ storage });
      const result = await relayer2.getPublicKey();
      expect(result).toEqual(pk);
      expect(mockWorkerClient.getPublicKey).not.toHaveBeenCalled();
    });

    it("does not cache when storage is not provided (backward compatible)", async () => {
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createWebRelayer(); // no storage
      await relayer.getPublicKey();
      await relayer.getPublicKey();

      expect(mockWorkerClient.getPublicKey).toHaveBeenCalledTimes(2);
    });

    it("clears cache on chain switch", async () => {
      const storage = new MemoryStorage();
      const getChainId = vi.fn().mockResolvedValue(CHAIN_ID);
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createWebRelayer({ storage, getChainId });
      await relayer.getPublicKey();
      expect(mockWorkerClient.getPublicKey).toHaveBeenCalledOnce();

      // Switch chain — cache should be cleared
      getChainId.mockResolvedValue(1);
      const pk2 = { publicKeyId: "pk-2", publicKey: new Uint8Array([2]) };
      mockWorkerClient.getPublicKey.mockResolvedValue({ result: pk2 });
      const result = await relayer.getPublicKey();
      expect(result).toEqual(pk2);
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

      const relayer = createWebRelayer({ storage, revalidateIntervalMs: 0 });

      // First call — init worker, fetch and cache pk
      await relayer.getPublicKey();
      expect(RelayerWorkerClient).toHaveBeenCalledTimes(1);

      // Mock fetch for revalidation: manifest returns changed dataId
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes("/keyurl")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                fhePublicKey: {
                  dataId: "pk-ROTATED",
                  urls: ["https://cdn.example.com/pk.bin"],
                },
              }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      // Force revalidation by setting lastValidatedAt to 0
      const pkKey = `fhe:pubkey:${CHAIN_ID}`;
      const cached = await storage.get<Record<string, unknown>>(pkKey);
      if (cached) {
        cached.lastValidatedAt = 0;
        await storage.set(pkKey, cached);
      }

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

      const relayer = createWebRelayer({ storage, revalidateIntervalMs: 86_400_000 });

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

  describe("chain ID change", () => {
    it("re-initializes the pool when chain ID changes", async () => {
      const getChainId = vi.fn().mockResolvedValue(CHAIN_ID);
      const relayer = createNodeRelayer({ getChainId });
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(1);

      // Switch chain
      getChainId.mockResolvedValue(1);
      await relayer.generateKeypair();

      expect(mockPool.terminate).toHaveBeenCalledOnce();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(2);
    });
  });

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

      await expect(relayer.generateKeypair()).rejects.toThrow(EncryptionFailedError);
      await expect(relayer.generateKeypair()).rejects.toThrow("RelayerNode has been terminated");
    });

    it("is safe to call terminate before any initialization", () => {
      const relayer = createNodeRelayer();
      expect(() => relayer.terminate()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Init error handling
  // -------------------------------------------------------------------------

  describe("initialization errors", () => {
    it("wraps non-ZamaError init failures in EncryptionFailedError", async () => {
      mockPool.initPool.mockRejectedValueOnce(new Error("pool init failed"));
      const relayer = createNodeRelayer();

      const promise = relayer.generateKeypair();
      await expect(promise).rejects.toThrow(EncryptionFailedError);
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

      const relayer = createNodeRelayer({ storage });
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
      const pp = { publicParamsId: "pp-1", publicParams: new Uint8Array([4, 5]) };
      mockPool.getPublicParams.mockResolvedValue({ result: pp });

      const relayer = createNodeRelayer({ storage });
      const result = await relayer.getPublicParams(2048);
      expect(result).toEqual(pp);
      expect(mockPool.getPublicParams).toHaveBeenCalledOnce();

      const result2 = await relayer.getPublicParams(2048);
      expect(result2).toEqual(pp);
      expect(mockPool.getPublicParams).toHaveBeenCalledOnce();
    });

    it("does not cache when storage is not provided (backward compatible)", async () => {
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createNodeRelayer(); // no storage
      await relayer.getPublicKey();
      await relayer.getPublicKey();

      expect(mockPool.getPublicKey).toHaveBeenCalledTimes(2);
    });

    it("clears cache on chain switch", async () => {
      const storage = new MemoryStorage();
      const getChainId = vi.fn().mockResolvedValue(CHAIN_ID);
      const pk = { publicKeyId: "pk-1", publicKey: new Uint8Array([1]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk });

      const relayer = createNodeRelayer({ storage, getChainId });
      await relayer.getPublicKey();
      expect(mockPool.getPublicKey).toHaveBeenCalledOnce();

      // Switch chain — cache should be cleared
      getChainId.mockResolvedValue(1);
      const pk2 = { publicKeyId: "pk-2", publicKey: new Uint8Array([2]) };
      mockPool.getPublicKey.mockResolvedValue({ result: pk2 });
      const result = await relayer.getPublicKey();
      expect(result).toEqual(pk2);
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

      const relayer = createNodeRelayer({ storage, revalidateIntervalMs: 0 });

      // First call — init pool, fetch and cache pk
      await relayer.getPublicKey();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(1);

      // Mock fetch for revalidation: manifest returns changed dataId
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (String(url).includes("/keyurl")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                fhePublicKey: {
                  dataId: "pk-ROTATED",
                  urls: ["https://cdn.example.com/pk.bin"],
                },
              }),
          });
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      });

      // Force revalidation by setting lastValidatedAt to 0
      const pkKey = `fhe:pubkey:${CHAIN_ID}`;
      const cached = await storage.get<Record<string, unknown>>(pkKey);
      if (cached) {
        cached.lastValidatedAt = 0;
        await storage.set(pkKey, cached);
      }

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

      const relayer = createNodeRelayer({ storage, revalidateIntervalMs: 86_400_000 });

      await relayer.getPublicKey();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(1);

      // Interval hasn't elapsed — no revalidation, same pool
      await relayer.getPublicKey();
      expect(NodeWorkerPool).toHaveBeenCalledTimes(1);
      expect(mockPool.terminate).not.toHaveBeenCalled();
    });
  });
});
