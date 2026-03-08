import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import { Relayer } from "../../services/Relayer";
import type { RelayerNodeConfig } from "../relayer-node";

const mockPool = {
  initPool: vi.fn().mockResolvedValue(undefined),
  terminate: vi.fn(),
  generateKeypair: vi.fn().mockResolvedValue({
    publicKey: "pub-key-123",
    privateKey: "priv-key-456",
  }),
  encrypt: vi.fn().mockResolvedValue({
    handles: [new Uint8Array([1, 2])],
    inputProof: new Uint8Array([3, 4]),
  }),
  userDecrypt: vi.fn().mockResolvedValue({
    clearValues: { "0xhandle1": 42n },
  }),
  publicDecrypt: vi.fn().mockResolvedValue({
    clearValues: { "0xhandle1": 42n },
    abiEncodedClearValues: "0x00",
    decryptionProof: "0xproof",
  }),
  createEIP712: vi.fn().mockResolvedValue({
    domain: {
      name: "test",
      version: "1",
      chainId: 1,
      verifyingContract: "0xabc",
    },
    types: {
      UserDecryptRequestVerification: [{ name: "publicKey", type: "string" }],
    },
    message: {
      publicKey: "pub-key",
      contractAddresses: ["0xabc"],
      startTimestamp: 1000n,
      durationDays: 7n,
      extraData: "0x",
    },
  }),
  createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({
    domain: { name: "test" },
    types: {},
    message: {},
  }),
  delegatedUserDecrypt: vi.fn().mockResolvedValue({
    clearValues: { "0xhandle2": 100n },
  }),
  requestZKProofVerification: vi.fn().mockResolvedValue(new Uint8Array([5, 6])),
  getPublicKey: vi.fn().mockResolvedValue({
    result: { publicKeyId: "pk-id", publicKey: new Uint8Array([7, 8]) },
  }),
  getPublicParams: vi.fn().mockResolvedValue({
    result: { publicParamsId: "pp-id", publicParams: new Uint8Array([9, 10]) },
  }),
};

// Mock the node worker pool module with a proper class
vi.mock("../../worker/worker.node-pool", () => {
  return {
    NodeWorkerPool: class MockNodeWorkerPool {
      initPool = mockPool.initPool;
      terminate = mockPool.terminate;
      generateKeypair = mockPool.generateKeypair;
      encrypt = mockPool.encrypt;
      userDecrypt = mockPool.userDecrypt;
      publicDecrypt = mockPool.publicDecrypt;
      createEIP712 = mockPool.createEIP712;
      createDelegatedUserDecryptEIP712 = mockPool.createDelegatedUserDecryptEIP712;
      delegatedUserDecrypt = mockPool.delegatedUserDecrypt;
      requestZKProofVerification = mockPool.requestZKProofVerification;
      getPublicKey = mockPool.getPublicKey;
      getPublicParams = mockPool.getPublicParams;
    },
  };
});

const mockConfig: RelayerNodeConfig = {
  getChainId: () => Promise.resolve(1),
  transports: { 1: {} },
};

describe("makeRelayerNode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Lazy import to ensure mocks are in place
  async function getLayer() {
    const { makeRelayerNode } = await import("../relayer-node.layer");
    return makeRelayerNode(mockConfig);
  }

  it("provides a working Relayer service (generateKeypair)", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return yield* relayer.generateKeypair();
    });

    const result = await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));
    expect(result).toEqual({
      publicKey: "pub-key-123",
      privateKey: "priv-key-456",
    });
  });

  it("encrypt returns handles/inputProof", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return yield* relayer.encrypt({
        values: [{ value: 42n, type: "euint64" }],
        contractAddress: "0xabc" as `0x${string}`,
        userAddress: "0xdef" as `0x${string}`,
      });
    });

    const result = await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));

    expect(result.handles).toEqual([new Uint8Array([1, 2])]);
    expect(result.inputProof).toEqual(new Uint8Array([3, 4]));
  });

  it("userDecrypt returns clearValues", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return yield* relayer.userDecrypt({
        handles: ["0xhandle1" as `0x${string}`],
        contractAddress: "0xabc" as `0x${string}`,
        signedContractAddresses: ["0xabc" as `0x${string}`],
        privateKey: "priv",
        publicKey: "pub",
        signature: "sig",
        signerAddress: "0xdef" as `0x${string}`,
        startTimestamp: 1000,
        durationDays: 7,
      });
    });

    const result = await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));

    expect(result).toEqual({ "0xhandle1": 42n });
  });

  it("pool terminated on scope close", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      yield* Relayer;
    });

    await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));

    expect(mockPool.terminate).toHaveBeenCalledTimes(1);
  });
});
