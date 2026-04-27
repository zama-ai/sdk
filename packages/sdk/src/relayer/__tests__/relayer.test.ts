import { vi } from "vitest";
import { MemoryStorage } from "../../storage/memory-storage";
import { beforeEach, describe, expect, it } from "../../test-fixtures";

// ---------------------------------------------------------------------------
// Hoisted mocks (available inside vi.mock factories)
// ---------------------------------------------------------------------------

const { mockWorkerClient, mockPool } = vi.hoisted(() => {
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
    getExtraData: vi.fn().mockResolvedValue({ result: "0x" }),
  };

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
    getExtraData: vi.fn().mockResolvedValue({ result: "0x" }),
  };

  return { mockWorkerClient, mockPool };
});

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import { RelayerNode } from "../relayer-node";
import { RelayerWeb } from "../relayer-web";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const CHAIN_CONFIG = {
  id: 11155111,
  relayerUrl: "https://relayer.example.com",
} as any;

function createWebRelayer(
  overrides: Partial<ConstructorParameters<typeof RelayerWeb>[0]> = {},
): RelayerWeb {
  return new RelayerWeb({
    chain: CHAIN_CONFIG,
    worker: mockWorkerClient as any,
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
    pool: mockPool as any,
    ...overrides,
  });
}

function resetMocks(): void {
  vi.clearAllMocks();
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
  // Terminate
  // -------------------------------------------------------------------------

  describe("terminate", () => {
    it("does not terminate the worker (lifecycle not owned)", async () => {
      const relayer = createWebRelayer();
      mockWorkerClient.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      relayer.terminate();

      expect(mockWorkerClient.terminate).not.toHaveBeenCalled();
    });

    it("is safe to call terminate before any operation", () => {
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
      expect(mockWorkerClient.terminate).not.toHaveBeenCalled();
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
        chainId: 11155111,
        publicKey: "0xpub",
        contractAddresses: ["0x123"],
        startTimestamp: 1000,
        durationDays: 7,
        extraData: "0x",
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
      expect(mockWorkerClient.userDecrypt).toHaveBeenCalledWith({
        chainId: 11155111,
        ...params,
      });
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
      expect(mockWorkerClient.publicDecrypt).toHaveBeenCalledWith({
        chainId: 11155111,
        handles: [HANDLE],
      });
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
        chainId: 11155111,
        publicKey: "0xpk",
        contractAddresses: ["0xC"],
        delegatorAddress: "0xDelegator",
        startTimestamp: 1000,
        durationDays: 7,
        extraData: "0x",
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
      expect(mockWorkerClient.getPublicParams).toHaveBeenCalledWith({
        chainId: 11155111,
        bits: 2048,
      });
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
});

// ===========================================================================
// RelayerNode
// ===========================================================================

describe("RelayerNode", () => {
  beforeEach(resetMocks);

  // -------------------------------------------------------------------------
  // Terminate
  // -------------------------------------------------------------------------

  describe("terminate", () => {
    it("does not terminate the pool (lifecycle not owned)", async () => {
      const relayer = createNodeRelayer();
      mockPool.generateKeypair.mockResolvedValue({
        publicKey: "pk",
        privateKey: "sk",
      });

      await relayer.generateKeypair();
      relayer.terminate();

      expect(mockPool.terminate).not.toHaveBeenCalled();
    });

    it("is safe to call terminate before any operation", () => {
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
      expect(mockPool.terminate).not.toHaveBeenCalled();
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
        chainId: 11155111,
        publicKey: "0xpub",
        contractAddresses: ["0x123"],
        startTimestamp: 1000,
        durationDays: 7,
        extraData: "0x",
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
      expect(mockPool.userDecrypt).toHaveBeenCalledWith({
        chainId: 11155111,
        ...params,
      });
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
      expect(mockPool.publicDecrypt).toHaveBeenCalledWith({
        chainId: 11155111,
        handles: [HANDLE],
      });
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
        chainId: 11155111,
        publicKey: "0xpk",
        contractAddresses: ["0xC"],
        delegatorAddress: "0xDelegator",
        startTimestamp: 1000,
        durationDays: 7,
        extraData: "0x",
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
      expect(mockPool.getPublicParams).toHaveBeenCalledWith({
        chainId: 11155111,
        bits: 2048,
      });
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
});
