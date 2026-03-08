import { describe, it, expect, vi, beforeEach } from "vitest";
import { Effect } from "effect";
import { Relayer } from "../../services/Relayer";
import type { RelayerWebConfig } from "../relayer-sdk.types";

const mockClient = {
  initWorker: vi.fn().mockResolvedValue(undefined),
  terminate: vi.fn(),
  updateCsrf: vi.fn().mockResolvedValue(undefined),
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

// Mock the worker client module with a proper class
vi.mock("../../worker/worker.client", () => {
  return {
    RelayerWorkerClient: class MockRelayerWorkerClient {
      initWorker = mockClient.initWorker;
      terminate = mockClient.terminate;
      updateCsrf = mockClient.updateCsrf;
      generateKeypair = mockClient.generateKeypair;
      encrypt = mockClient.encrypt;
      userDecrypt = mockClient.userDecrypt;
      publicDecrypt = mockClient.publicDecrypt;
      createEIP712 = mockClient.createEIP712;
      createDelegatedUserDecryptEIP712 = mockClient.createDelegatedUserDecryptEIP712;
      delegatedUserDecrypt = mockClient.delegatedUserDecrypt;
      requestZKProofVerification = mockClient.requestZKProofVerification;
      getPublicKey = mockClient.getPublicKey;
      getPublicParams = mockClient.getPublicParams;
    },
  };
});

const mockConfig: RelayerWebConfig = {
  getChainId: () => Promise.resolve(1),
  transports: { 1: {} },
  onStatusChange: vi.fn(),
};

describe("makeRelayerWebLayer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Lazy import to ensure mocks are in place
  async function getLayer() {
    const { makeRelayerWebLayer } = await import("../relayer-web.layer");
    return makeRelayerWebLayer(mockConfig);
  }

  it("provides a working Relayer service", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return relayer;
    });

    const result = await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));
    expect(result).toBeDefined();
  });

  it("initializes the worker on layer creation", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      yield* Relayer;
    });

    await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));
    expect(mockClient.initWorker).toHaveBeenCalledTimes(1);
  });

  it("calls onStatusChange('ready') after init", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      yield* Relayer;
    });

    await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));
    expect(mockConfig.onStatusChange).toHaveBeenCalledWith("ready");
  });

  it("encrypt works through the layer", async () => {
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

  it("userDecrypt works through the layer", async () => {
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

  it("generateKeypair works through the layer", async () => {
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

  it("terminates worker when scope closes", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      yield* Relayer;
    });

    await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));

    // After scope closes, terminate should have been called
    expect(mockClient.terminate).toHaveBeenCalledTimes(1);
  });

  it("createEIP712 adds EIP712Domain type", async () => {
    const layer = await getLayer();
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return yield* relayer.createEIP712("pub-key", ["0xabc" as `0x${string}`], 1000, 7);
    });

    const result = await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));

    expect(result.types.EIP712Domain).toBeDefined();
    expect(result.types.EIP712Domain).toEqual([
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
    ]);
  });

  it("refreshes CSRF before encrypt", async () => {
    const configWithCsrf: RelayerWebConfig = {
      ...mockConfig,
      security: { getCsrfToken: () => "csrf-token-123" },
    };
    const { makeRelayerWebLayer } = await import("../relayer-web.layer");
    const layer = makeRelayerWebLayer(configWithCsrf);

    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      yield* relayer.encrypt({
        values: [{ value: 42n, type: "euint64" }],
        contractAddress: "0xabc" as `0x${string}`,
        userAddress: "0xdef" as `0x${string}`,
      });
    });

    await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(layer)));

    expect(mockClient.updateCsrf).toHaveBeenCalledWith("csrf-token-123");
  });
});
