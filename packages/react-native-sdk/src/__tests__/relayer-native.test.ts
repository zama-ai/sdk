import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelayerNative, type RelayerNativeConfig } from "../relayer-native";
import type { FhevmInstance } from "@fhevm/react-native-sdk";

const mockInstance = vi.hoisted(() => ({
  config: {
    chainId: 11155111,
    gatewayChainId: 10901,
    aclContractAddress: "0xACL",
    verifyingContractAddressDecryption: "0xDEC",
    verifyingContractAddressInputVerification: "0xINP",
    kmsContractAddress: "0xKMS",
    inputVerifierContractAddress: "0xIV",
    relayerUrl: "https://relayer.test",
    network: "https://rpc.test",
  },
  generateKeypair: vi.fn().mockResolvedValue({
    publicKey: "0xpub",
    privateKey: "0xpriv",
  }),
  createEIP712: vi.fn().mockResolvedValue({
    domain: { name: "test" },
    types: {},
    primaryType: "UserDecryptRequestVerification",
    message: {},
  }),
  createDelegatedUserDecryptEIP712: vi.fn().mockResolvedValue({
    domain: { name: "test" },
    types: {},
    primaryType: "DelegatedUserDecryptRequestVerification",
    message: {},
  }),
  createEncryptedInput: vi.fn().mockReturnValue({
    addBool: vi.fn().mockReturnThis(),
    add4: vi.fn().mockReturnThis(),
    add8: vi.fn().mockReturnThis(),
    add16: vi.fn().mockReturnThis(),
    add32: vi.fn().mockReturnThis(),
    add64: vi.fn().mockReturnThis(),
    add128: vi.fn().mockReturnThis(),
    add256: vi.fn().mockReturnThis(),
    addAddress: vi.fn().mockReturnThis(),
    encrypt: vi.fn().mockResolvedValue({
      handles: [new Uint8Array([1, 2])],
      inputProof: new Uint8Array([3, 4]),
    }),
  }),
  publicDecrypt: vi.fn().mockResolvedValue({
    clearValues: { "0xhandle": 42n },
    abiEncodedClearValues: "0xabi",
    decryptionProof: "0xproof",
  }),
  userDecrypt: vi.fn().mockResolvedValue({ "0xhandle": 100n }),
  delegatedUserDecrypt: vi.fn().mockResolvedValue({ "0xhandle": 200n }),
  requestZKProofVerification: vi.fn().mockResolvedValue({
    handles: [new Uint8Array([5])],
    inputProof: new Uint8Array([6]),
  }),
  getPublicKey: vi.fn().mockResolvedValue({
    publicKeyId: "pk-1",
    publicKey: new Uint8Array([7, 8]),
  }),
  getPublicParams: vi.fn().mockResolvedValue({
    publicParams: new Uint8Array([9, 10]),
    publicParamsId: "pp-1",
  }),
  verifyProvenCiphertext: vi.fn().mockResolvedValue(true),
})) as unknown as FhevmInstance;

vi.mock("@fhevm/react-native-sdk", () => ({
  createInstance: vi.fn().mockResolvedValue(mockInstance),
}));

// `expo-sqlite/kv-store` is only loadable inside an Expo runtime; stub it so
// the default `fheArtifactStorage` (a `SqliteKvStoreAdapter`) can be
// constructed during tests without touching the real native module.
vi.mock("expo-sqlite/kv-store", () => {
  const store = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (k: string) => store.get(k) ?? null),
      setItem: vi.fn(async (k: string, v: string) => {
        store.set(k, v);
      }),
      removeItem: vi.fn(async (k: string) => {
        store.delete(k);
      }),
    },
  };
});

const TEST_CHAIN_ID = 11155111;

function makeConfig(overrides: Partial<RelayerNativeConfig> = {}): RelayerNativeConfig {
  return {
    transports: { [TEST_CHAIN_ID]: mockInstance.config },
    getChainId: async () => TEST_CHAIN_ID,
    ...overrides,
  };
}

describe("RelayerNative", () => {
  let relayer: RelayerNative;

  beforeEach(() => {
    vi.clearAllMocks();
    relayer = new RelayerNative(makeConfig());
  });

  it("lazily creates instance on first call", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    expect(createInstance).not.toHaveBeenCalled();
    await relayer.generateKeypair();
    expect(createInstance).toHaveBeenCalledOnce();
    // Config passed to `createInstance` is `DefaultConfigs[chainId]` merged
    // with `transports[chainId]`; the mock's overrides win for shared keys.
    expect(createInstance).toHaveBeenCalledWith(expect.objectContaining(mockInstance.config));
  });

  it("reuses instance on subsequent calls", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    await relayer.generateKeypair();
    await relayer.generateKeypair();
    expect(createInstance).toHaveBeenCalledOnce();
  });

  it("deduplicates concurrent initialization", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    await Promise.all([relayer.generateKeypair(), relayer.getPublicKey()]);
    expect(createInstance).toHaveBeenCalledOnce();
  });

  it("generateKeypair returns hex keypair", async () => {
    const kp = await relayer.generateKeypair();
    expect(kp).toEqual({ publicKey: "0xpub", privateKey: "0xpriv" });
  });

  it("createEIP712 delegates to instance", async () => {
    const result = await relayer.createEIP712("0xpub", ["0xcontract"], 1000, 30);
    expect(mockInstance.createEIP712).toHaveBeenCalledWith("0xpub", ["0xcontract"], 1000, 30);
    expect(result.domain).toEqual({ name: "test" });
  });

  it("encrypt maps EncryptInput[] to builder pattern", async () => {
    const result = await relayer.encrypt({
      values: [
        { value: 42n, type: "euint64" },
        { value: true, type: "ebool" },
        { value: "0xaddr" as `0x${string}`, type: "eaddress" },
      ],
      contractAddress: "0xcontract",
      userAddress: "0xuser",
    });

    expect(mockInstance.createEncryptedInput).toHaveBeenCalledWith("0xcontract", "0xuser");
    const builder = (mockInstance.createEncryptedInput as ReturnType<typeof vi.fn>).mock.results[0]!
      .value;
    expect(builder.add64).toHaveBeenCalledWith(42n);
    expect(builder.addBool).toHaveBeenCalledWith(true);
    expect(builder.addAddress).toHaveBeenCalledWith("0xaddr");
    expect(result.handles).toHaveLength(1);
  });

  it("publicDecrypt delegates to instance", async () => {
    const result = await relayer.publicDecrypt(["0xhandle"]);
    expect(result.clearValues).toEqual({ "0xhandle": 42n });
  });

  it("getAclAddress returns config address", async () => {
    const addr = await relayer.getAclAddress();
    expect(addr).toBe("0xACL");
  });

  it("terminate is a no-op", () => {
    expect(() => relayer.terminate()).not.toThrow();
  });

  it("createEIP712 defaults durationDays to 30 when omitted", async () => {
    await relayer.createEIP712("0xpub", ["0xcontract"], 1000);
    expect(mockInstance.createEIP712).toHaveBeenCalledWith("0xpub", ["0xcontract"], 1000, 30);
  });

  it("createDelegatedUserDecryptEIP712 forwards args and defaults durationDays to 30", async () => {
    await relayer.createDelegatedUserDecryptEIP712("0xpub", ["0xc"], "0xdelegator", 1000);
    expect(mockInstance.createDelegatedUserDecryptEIP712).toHaveBeenCalledWith(
      "0xpub",
      ["0xc"],
      "0xdelegator",
      1000,
      30,
    );
  });

  it("userDecrypt maps handles to (handle, contractAddress) pairs and forwards args", async () => {
    const params = {
      handles: ["0xh1", "0xh2"] as `0x${string}`[],
      contractAddress: "0xcontract" as `0x${string}`,
      privateKey: "0xpriv" as `0x${string}`,
      publicKey: "0xpub" as `0x${string}`,
      signature: "0xsig" as `0x${string}`,
      signedContractAddresses: ["0xcontract"] as `0x${string}`[],
      signerAddress: "0xsigner" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 30,
    };
    await relayer.userDecrypt(params);
    expect(mockInstance.userDecrypt).toHaveBeenCalledWith(
      [
        { handle: "0xh1", contractAddress: "0xcontract" },
        { handle: "0xh2", contractAddress: "0xcontract" },
      ],
      "0xpriv",
      "0xpub",
      "0xsig",
      ["0xcontract"],
      "0xsigner",
      1000,
      30,
    );
  });

  it("delegatedUserDecrypt maps handles to pairs and forwards args", async () => {
    const params = {
      handles: ["0xh1"] as `0x${string}`[],
      contractAddress: "0xcontract" as `0x${string}`,
      privateKey: "0xpriv" as `0x${string}`,
      publicKey: "0xpub" as `0x${string}`,
      signature: "0xsig" as `0x${string}`,
      signedContractAddresses: ["0xcontract"] as `0x${string}`[],
      delegatorAddress: "0xdelegator" as `0x${string}`,
      delegateAddress: "0xdelegate" as `0x${string}`,
      startTimestamp: 1000,
      durationDays: 30,
    };
    await relayer.delegatedUserDecrypt(params);
    expect(mockInstance.delegatedUserDecrypt).toHaveBeenCalledWith(
      [{ handle: "0xh1", contractAddress: "0xcontract" }],
      "0xpriv",
      "0xpub",
      "0xsig",
      ["0xcontract"],
      "0xdelegator",
      "0xdelegate",
      1000,
      30,
    );
  });

  it("encrypt dispatches every numeric FHE type to the right builder method", async () => {
    await relayer.encrypt({
      values: [
        { value: 1n, type: "euint8" },
        { value: 2n, type: "euint16" },
        { value: 3n, type: "euint32" },
        { value: 4n, type: "euint64" },
        { value: 5n, type: "euint128" },
        { value: 6n, type: "euint256" },
      ],
      contractAddress: "0xcontract",
      userAddress: "0xuser",
    });
    const builder = (mockInstance.createEncryptedInput as ReturnType<typeof vi.fn>).mock.results[0]!
      .value;
    expect(builder.add8).toHaveBeenCalledWith(1n);
    expect(builder.add16).toHaveBeenCalledWith(2n);
    expect(builder.add32).toHaveBeenCalledWith(3n);
    expect(builder.add64).toHaveBeenCalledWith(4n);
    expect(builder.add128).toHaveBeenCalledWith(5n);
    expect(builder.add256).toHaveBeenCalledWith(6n);
  });

  it("encrypt throws on an unrecognized FHE type instead of silently dropping it", async () => {
    await expect(
      relayer.encrypt({
        // Cast through unknown to simulate a future/unknown type slipping past TS.
        values: [{ value: 42n, type: "euint512" } as unknown as never],
        contractAddress: "0xcontract",
        userAddress: "0xuser",
      }),
    ).rejects.toThrow(/Unsupported FHE type "euint512"/);
  });

  it("getPublicParams forwards the bits argument", async () => {
    const result = await relayer.getPublicParams(2048);
    expect(mockInstance.getPublicParams).toHaveBeenCalledWith(2048);
    expect(result).toEqual({ publicParams: new Uint8Array([9, 10]), publicParamsId: "pp-1" });
  });

  it("requestZKProofVerification delegates to instance", async () => {
    const proof = { handles: [new Uint8Array([1])], inputProof: new Uint8Array([2]) };
    const result = await relayer.requestZKProofVerification(proof as never);
    expect(mockInstance.requestZKProofVerification).toHaveBeenCalledWith(proof);
    expect(result.handles).toHaveLength(1);
  });

  it("getAclAddress throws when aclContractAddress is missing from the merged config", async () => {
    const badRelayer = new RelayerNative(
      makeConfig({
        transports: {
          [TEST_CHAIN_ID]: { ...mockInstance.config, aclContractAddress: undefined as never },
        },
      }),
    );
    await expect(badRelayer.getAclAddress()).rejects.toThrow(/No ACL address configured/);
  });

  it("retries initialization after a failed createInstance call", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    const createInstanceMock = createInstance as ReturnType<typeof vi.fn>;
    createInstanceMock.mockRejectedValueOnce(new Error("network error"));

    // First call fails — the underlying error is wrapped in a
    // ConfigurationError, but the relayer is not permanently stuck.
    await expect(relayer.generateKeypair()).rejects.toThrow(
      /Failed to initialize native FHE instance/,
    );

    // Second call retries (re-invokes createInstance) and succeeds.
    await expect(relayer.generateKeypair()).resolves.toEqual({
      publicKey: "0xpub",
      privateKey: "0xpriv",
    });
    expect(createInstanceMock).toHaveBeenCalledTimes(2);
  });

  it("re-initializes when getChainId reports a different chain", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    const createInstanceMock = createInstance as ReturnType<typeof vi.fn>;
    let currentChain = TEST_CHAIN_ID;
    const chainRelayer = new RelayerNative({
      transports: {
        [TEST_CHAIN_ID]: mockInstance.config,
        // Second entry reuses the mock config but keyed on a different chain
        // so the same `createInstance` mock handles both.
        1: mockInstance.config,
      },
      getChainId: async () => currentChain,
    });

    await chainRelayer.generateKeypair();
    expect(createInstanceMock).toHaveBeenCalledTimes(1);

    // Switch chain — next call should tear down and re-init.
    currentChain = 1;
    await chainRelayer.generateKeypair();
    expect(createInstanceMock).toHaveBeenCalledTimes(2);
  });

  it("transitions status idle → initializing → ready and fires onStatusChange", async () => {
    const statusChanges: Array<{ status: string; error?: string }> = [];
    const tracked = new RelayerNative(
      makeConfig({
        onStatusChange: (status, error) => {
          statusChanges.push({ status, error: error?.message });
        },
      }),
    );

    expect(tracked.status).toBe("idle");

    await tracked.generateKeypair();
    expect(tracked.status).toBe("ready");
    // Full transition sequence must pass through "initializing" first.
    expect(statusChanges.map((s) => s.status)).toEqual(["initializing", "ready"]);
    expect(tracked.initError).toBeUndefined();
  });

  it("transitions status to 'error' with initError on init failure", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    (createInstance as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("boom"));

    const statusChanges: string[] = [];
    const tracked = new RelayerNative(
      makeConfig({
        onStatusChange: (status) => {
          statusChanges.push(status);
        },
      }),
    );

    await expect(tracked.generateKeypair()).rejects.toThrow();
    expect(tracked.status).toBe("error");
    expect(tracked.initError).toBeInstanceOf(Error);
    expect(tracked.initError?.message).toMatch(/Failed to initialize/);
    expect(statusChanges).toEqual(["initializing", "error"]);
  });

  it("terminate() then reuse re-initializes a fresh instance", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    const createInstanceMock = createInstance as ReturnType<typeof vi.fn>;

    await relayer.generateKeypair();
    expect(createInstanceMock).toHaveBeenCalledTimes(1);

    relayer.terminate();

    await relayer.generateKeypair();
    expect(createInstanceMock).toHaveBeenCalledTimes(2);
  });

  it("[Symbol.dispose]() delegates to terminate()", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    const createInstanceMock = createInstance as ReturnType<typeof vi.fn>;

    await relayer.generateKeypair();
    relayer[Symbol.dispose]();

    await relayer.generateKeypair();
    expect(createInstanceMock).toHaveBeenCalledTimes(2);
  });

  it("getAclAddress does not initialize the native instance", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    const addr = await relayer.getAclAddress();
    expect(addr).toBe("0xACL");
    expect(createInstance).not.toHaveBeenCalled();
  });

  it("throws ConfigurationError for an unregistered chain ID", async () => {
    const bad = new RelayerNative({
      transports: {}, // empty — no chain registered
      getChainId: async () => 999,
    });
    await expect(bad.generateKeypair()).rejects.toThrow(/No transport config registered/);
  });
});
