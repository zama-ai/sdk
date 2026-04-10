import { describe, it, expect, vi, beforeEach } from "vitest";
import { RelayerNative } from "../relayer-native";
import type { FhevmInstance, FhevmInstanceConfig } from "@fhevm/react-native-sdk";

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

const testConfig: FhevmInstanceConfig = mockInstance.config;

describe("RelayerNative", () => {
  let relayer: RelayerNative;

  beforeEach(() => {
    vi.clearAllMocks();
    relayer = new RelayerNative(testConfig);
  });

  it("lazily creates instance on first call", async () => {
    const { createInstance } = await import("@fhevm/react-native-sdk");
    expect(createInstance).not.toHaveBeenCalled();
    await relayer.generateKeypair();
    expect(createInstance).toHaveBeenCalledOnce();
    expect(createInstance).toHaveBeenCalledWith(testConfig);
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
});
