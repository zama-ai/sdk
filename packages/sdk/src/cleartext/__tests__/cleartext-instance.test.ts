import { describe, it, expect, vi } from "vitest";
import { AbiCoder } from "ethers";

const coder = AbiCoder.defaultAbiCoder();
const ENCODED_TRUE = coder.encode(["bool"], [true]);
const ENCODED_42 = coder.encode(["uint256"], [42n]);

// Mock ethers providers — provider.call returns ABI-encoded results
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();

  class MockJsonRpcProvider {
    getNetwork = vi.fn().mockResolvedValue({ chainId: 31337n });
    call = vi.fn().mockImplementation(({ data }: { data: string }) => {
      // plaintexts(bytes32) selector = 0xf7c21ff0
      if (data.startsWith("0xf7c21ff0")) {
        return Promise.resolve(actual.AbiCoder.defaultAbiCoder().encode(["uint256"], [42n]));
      }
      // ACL functions return true
      return Promise.resolve(actual.AbiCoder.defaultAbiCoder().encode(["bool"], [true]));
    });
  }
  class MockBrowserProvider {
    getNetwork = vi.fn().mockResolvedValue({ chainId: 31337n });
    call = vi.fn().mockResolvedValue(actual.AbiCoder.defaultAbiCoder().encode(["bool"], [true]));
  }

  return {
    ...actual,
    JsonRpcProvider: MockJsonRpcProvider,
    BrowserProvider: MockBrowserProvider,
  };
});

import { createCleartextInstance } from "../cleartext-instance";

const CONFIG = {
  network: "http://127.0.0.1:8545",
  chainId: 31337,
  gatewayChainId: 10901,
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  kmsContractAddress: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
  inputVerifierContractAddress: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  cleartextExecutorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  coprocessorSignerPrivateKey: "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901",
  kmsSignerPrivateKey: "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91",
};

describe("createCleartextInstance", () => {
  it("returns an object with all required methods", () => {
    const instance = createCleartextInstance(CONFIG);

    expect(instance.createEncryptedInput).toBeTypeOf("function");
    expect(instance.generateKeypair).toBeTypeOf("function");
    expect(instance.createEIP712).toBeTypeOf("function");
    expect(instance.publicDecrypt).toBeTypeOf("function");
    expect(instance.userDecrypt).toBeTypeOf("function");
    expect(instance.getPublicKey).toBeTypeOf("function");
    expect(instance.getPublicParams).toBeTypeOf("function");
  });

  it("generateKeypair returns public and private keys", () => {
    const instance = createCleartextInstance(CONFIG);
    const kp = instance.generateKeypair();
    expect(kp.publicKey).toBeTypeOf("string");
    expect(kp.privateKey).toBeTypeOf("string");
    expect(kp.publicKey.length).toBeGreaterThan(0);
    expect(kp.privateKey.length).toBeGreaterThan(0);
  });

  it("createEncryptedInput returns a builder", () => {
    const instance = createCleartextInstance(CONFIG);
    const input = instance.createEncryptedInput(
      CONFIG.cleartextExecutorAddress,
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    );
    expect(input.add64).toBeTypeOf("function");
    expect(input.encrypt).toBeTypeOf("function");
  });

  it("getPublicKey returns mock data", () => {
    const instance = createCleartextInstance(CONFIG);
    const result = instance.getPublicKey();
    expect(result).not.toBeNull();
    expect(result!.publicKeyId).toBe("mock-public-key-id");
  });

  it("requestZKProofVerification throws", async () => {
    const instance = createCleartextInstance(CONFIG);
    await expect(instance.requestZKProofVerification()).rejects.toThrow(
      "not supported in cleartext mode",
    );
  });

  it("getPublicParams returns mock data", () => {
    const instance = createCleartextInstance(CONFIG);
    const result = instance.getPublicParams();
    expect(result).not.toBeNull();
    expect(result!.publicParamsId).toBe("mock-public-params-id");
  });

  it("createEIP712 returns correct EIP712 structure", () => {
    const instance = createCleartextInstance(CONFIG);
    const pubKey = "0xabcd";
    const contracts = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
    const result = instance.createEIP712(pubKey, contracts, 1000, 30);

    expect(result.domain.name).toBe("Decryption");
    expect(result.domain.version).toBe("1");
    expect(result.domain.chainId).toBe(BigInt(CONFIG.gatewayChainId));
    expect(result.domain.verifyingContract).toBe(CONFIG.verifyingContractAddressDecryption);
    expect(result.types.UserDecryptRequestVerification).toBeDefined();
    expect(result.message.publicKey).toBe(pubKey);
    expect(result.message.contractAddresses).toBe(contracts);
    expect(result.message.startTimestamp).toBe(1000n);
    expect(result.message.durationDays).toBe(30n);
    expect(result.message.extraData).toBe("0x00");
  });

  it("createDelegatedUserDecryptEIP712 returns correct structure", () => {
    const instance = createCleartextInstance(CONFIG);
    const pubKey = "0xabcd";
    const contracts = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"];
    const delegator = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
    const result = instance.createDelegatedUserDecryptEIP712(pubKey, contracts, delegator, 2000, 7);

    expect(result.domain.name).toBe("Decryption");
    expect(result.domain.chainId).toBe(BigInt(CONFIG.gatewayChainId));
    expect(result.types.DelegatedUserDecryptRequestVerification).toBeDefined();
    expect(result.message.publicKey).toBe(pubKey);
    expect(result.message.delegatorAddress).toBe(delegator);
    expect(result.message.startTimestamp).toBe(2000n);
    expect(result.message.durationDays).toBe(7n);
  });

  it("publicDecrypt delegates to cleartextPublicDecrypt", async () => {
    const instance = createCleartextInstance(CONFIG);
    const handle = "0x" + "00".repeat(32);
    const result = await instance.publicDecrypt([handle]);
    // handle byte 30 = 0x00 → fheTypeId 0 (ebool), mock returns 42n → formatPlaintext(42n, 0) → false
    expect(result.clearValues[handle]).toBe(false);
    // Decryption proof: 1 byte numSigners + 65 bytes signature = 66 bytes
    expect(result.decryptionProof).toMatch(/^0x/);
    expect(result.decryptionProof.length).toBe(2 + 66 * 2);
  });

  it("userDecrypt delegates to cleartextUserDecrypt", async () => {
    const instance = createCleartextInstance(CONFIG);
    const handle = "0x" + "00".repeat(32);
    const contract = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
    const user = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const result = await instance.userDecrypt(
      [{ handle, contractAddress: contract }],
      "0xprivkey",
      "0xpubkey",
      "0xsig",
      [contract],
      user,
      1000,
      30,
    );
    // handle is all-zeros → fheTypeId=0 (ebool), mock returns 42n → 42n===1n → false
    expect(result[handle]).toBe(false);
  });

  it("rejects production chain IDs", () => {
    expect(() => createCleartextInstance({ ...CONFIG, chainId: 1 })).toThrow(
      "Cleartext mode is not allowed on chain 1",
    );
    expect(() => createCleartextInstance({ ...CONFIG, chainId: 11155111 })).toThrow(
      "Cleartext mode is not allowed on chain 11155111",
    );
  });

  it("resolves BrowserProvider when network is an object (Eip1193Provider)", () => {
    const eip1193Mock = { request: vi.fn() }; // mimics Eip1193Provider
    const instance = createCleartextInstance({
      ...CONFIG,
      network: eip1193Mock as never,
    });
    // If it didn't throw, BrowserProvider path was taken
    expect(instance.createEncryptedInput).toBeTypeOf("function");
  });

  it("delegatedUserDecrypt delegates to cleartextDelegatedUserDecrypt", async () => {
    const instance = createCleartextInstance(CONFIG);
    const handle = "0x" + "00".repeat(32);
    const contract = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
    const delegator = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
    const delegate = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
    const result = await instance.delegatedUserDecrypt(
      [{ handle, contractAddress: contract }],
      "0xprivkey",
      "0xpubkey",
      "0xsig",
      [contract],
      delegator,
      delegate,
      1000,
      30,
    );
    // handle is all-zeros → fheTypeId=0 (ebool), mock returns 42n → 42n===1n → false
    expect(result[handle]).toBe(false);
  });
});
