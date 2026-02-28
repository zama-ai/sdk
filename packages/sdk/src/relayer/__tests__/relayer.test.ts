import { describe, it, expect, vi, beforeEach } from "vitest";
import { EncryptionFailedError } from "../../token/errors";

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
    it("terminates the worker and rejects subsequent calls", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      relayer.terminate();

      expect(mockWorkerClient.terminate).toHaveBeenCalledOnce();

      await expect(relayer.generateKeypair()).rejects.toThrow(EncryptionFailedError);
      await expect(relayer.generateKeypair()).rejects.toThrow("RelayerWeb has been terminated");
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
        values: [100n],
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
        values: [100n],
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
        values: [100n],
        contractAddress: "0xContract" as `0x${string}`,
        userAddress: "0xUser" as `0x${string}`,
      });

      expect(mockWorkerClient.updateCsrf).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Status tracking
  // -------------------------------------------------------------------------

  describe("status tracking", () => {
    it("starts as idle", () => {
      const relayer = createWebRelayer();
      expect(relayer.getStatus()).toBe("idle");
    });

    it("transitions to initializing then ready on first use", async () => {
      const relayer = createWebRelayer();
      const statuses: string[] = [];
      relayer.onStatusChange((s) => statuses.push(s));

      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });
      await relayer.generateKeypair();

      expect(statuses).toEqual(["initializing", "ready"]);
      expect(relayer.getStatus()).toBe("ready");
    });

    it("transitions to error on init failure", async () => {
      mockWorkerClient.initWorker.mockRejectedValue(new Error("boom"));
      const relayer = createWebRelayer();
      const statuses: string[] = [];
      relayer.onStatusChange((s) => statuses.push(s));

      await expect(relayer.generateKeypair()).rejects.toThrow();

      expect(statuses).toContain("initializing");
      expect(statuses).toContain("error");
      expect(relayer.getStatus()).toBe("error");
    });

    it("transitions to idle on terminate", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });
      await relayer.generateKeypair();

      const statuses: string[] = [];
      relayer.onStatusChange((s) => statuses.push(s));
      relayer.terminate();

      expect(statuses).toEqual(["idle"]);
      expect(relayer.getStatus()).toBe("idle");
    });

    it("returns unsubscribe function", () => {
      const relayer = createWebRelayer();
      const listener = vi.fn();
      const unsubscribe = relayer.onStatusChange(listener);
      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
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
        values: [42n],
        contractAddress: "0xC" as `0x${string}`,
        userAddress: "0xU" as `0x${string}`,
      });

      expect(result).toEqual({ handles, inputProof });
    });

    it("userDecrypt delegates to worker and returns clearValues", async () => {
      const relayer = createWebRelayer();
      const clearValues = { handle1: 100n };
      mockWorkerClient.userDecrypt.mockResolvedValue({ clearValues });

      const params = {
        handles: ["h1"],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "sk",
        publicKey: "pk",
        signature: "sig",
        signerAddress: "0xS" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.userDecrypt(params);

      expect(result).toEqual({ handle1: 100n });
      expect(mockWorkerClient.userDecrypt).toHaveBeenCalledWith(params);
    });

    it("publicDecrypt delegates to worker and returns structured result", async () => {
      const relayer = createWebRelayer();
      const mockResult = {
        clearValues: { h1: 50n },
        abiEncodedClearValues: "0xencoded",
        decryptionProof: "0xproof" as `0x${string}`,
      };
      mockWorkerClient.publicDecrypt.mockResolvedValue(mockResult);

      const result = await relayer.publicDecrypt(["h1"]);

      expect(result).toEqual(mockResult);
      expect(mockWorkerClient.publicDecrypt).toHaveBeenCalledWith(["h1"]);
    });

    it("createDelegatedUserDecryptEIP712 delegates to worker", async () => {
      const relayer = createWebRelayer();
      const mockData = { some: "eip712data" };
      mockWorkerClient.createDelegatedUserDecryptEIP712.mockResolvedValue(mockData);

      const result = await relayer.createDelegatedUserDecryptEIP712(
        "pk",
        ["0xC" as `0x${string}`],
        "0xDelegator",
        1000,
        7,
      );

      expect(result).toBe(mockData);
      expect(mockWorkerClient.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith({
        publicKey: "pk",
        contractAddresses: ["0xC"],
        delegatorAddress: "0xDelegator",
        startTimestamp: 1000,
        durationDays: 7,
      });
    });

    it("delegatedUserDecrypt delegates to worker and returns clearValues", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.delegatedUserDecrypt.mockResolvedValue({
        clearValues: { h1: 200n },
      });

      const params = {
        handles: ["h1"],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "sk",
        publicKey: "pk",
        signature: "sig",
        delegatorAddress: "0xD" as `0x${string}`,
        delegateAddress: "0xE" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.delegatedUserDecrypt(params);

      expect(result).toEqual({ h1: 200n });
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
        values: [42n],
        contractAddress: "0xC" as `0x${string}`,
        userAddress: "0xU" as `0x${string}`,
      });

      expect(result).toEqual({ handles, inputProof });
    });

    it("userDecrypt delegates to pool and returns clearValues", async () => {
      const relayer = createNodeRelayer();
      const clearValues = { handle1: 100n };
      mockPool.userDecrypt.mockResolvedValue({ clearValues });

      const params = {
        handles: ["h1"],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "sk",
        publicKey: "pk",
        signature: "sig",
        signerAddress: "0xS" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.userDecrypt(params);

      expect(result).toEqual({ handle1: 100n });
      expect(mockPool.userDecrypt).toHaveBeenCalledWith(params);
    });

    it("publicDecrypt delegates to pool and returns structured result", async () => {
      const relayer = createNodeRelayer();
      const mockResult = {
        clearValues: { h1: 50n },
        abiEncodedClearValues: "0xencoded",
        decryptionProof: "0xproof" as `0x${string}`,
      };
      mockPool.publicDecrypt.mockResolvedValue(mockResult);

      const result = await relayer.publicDecrypt(["h1"]);

      expect(result).toEqual(mockResult);
      expect(mockPool.publicDecrypt).toHaveBeenCalledWith(["h1"]);
    });

    it("createDelegatedUserDecryptEIP712 delegates to pool", async () => {
      const relayer = createNodeRelayer();
      const mockData = { some: "eip712data" };
      mockPool.createDelegatedUserDecryptEIP712.mockResolvedValue(mockData);

      const result = await relayer.createDelegatedUserDecryptEIP712(
        "pk",
        ["0xC" as `0x${string}`],
        "0xDelegator",
        1000,
        7,
      );

      expect(result).toBe(mockData);
      expect(mockPool.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith({
        publicKey: "pk",
        contractAddresses: ["0xC"],
        delegatorAddress: "0xDelegator",
        startTimestamp: 1000,
        durationDays: 7,
      });
    });

    it("delegatedUserDecrypt delegates to pool and returns clearValues", async () => {
      const relayer = createNodeRelayer();
      mockPool.delegatedUserDecrypt.mockResolvedValue({
        clearValues: { h1: 200n },
      });

      const params = {
        handles: ["h1"],
        contractAddress: "0xC" as `0x${string}`,
        signedContractAddresses: ["0xC" as `0x${string}`],
        privateKey: "sk",
        publicKey: "pk",
        signature: "sig",
        delegatorAddress: "0xD" as `0x${string}`,
        delegateAddress: "0xE" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      };
      const result = await relayer.delegatedUserDecrypt(params);

      expect(result).toEqual({ h1: 200n });
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
});
