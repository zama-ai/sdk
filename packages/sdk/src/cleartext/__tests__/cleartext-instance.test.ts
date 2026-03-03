import { describe, it, expect, vi } from "vitest";

// Mock ethers Contract and JsonRpcProvider
vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();

  class MockJsonRpcProvider {
    getNetwork = vi.fn().mockResolvedValue({ chainId: 31337n });
  }
  class MockContract {
    plaintexts = vi.fn().mockResolvedValue(42n);
    isAllowedForDecryption = vi.fn().mockResolvedValue(true);
    persistAllowed = vi.fn().mockResolvedValue(true);
  }

  return {
    ...actual,
    JsonRpcProvider: MockJsonRpcProvider,
    Contract: MockContract,
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
};

describe("createCleartextInstance", () => {
  it("returns an object with all required methods", async () => {
    const instance = await createCleartextInstance(CONFIG);

    expect(instance.createEncryptedInput).toBeTypeOf("function");
    expect(instance.generateKeypair).toBeTypeOf("function");
    expect(instance.createEIP712).toBeTypeOf("function");
    expect(instance.publicDecrypt).toBeTypeOf("function");
    expect(instance.userDecrypt).toBeTypeOf("function");
    expect(instance.getPublicKey).toBeTypeOf("function");
    expect(instance.getPublicParams).toBeTypeOf("function");
  });

  it("generateKeypair returns public and private keys", async () => {
    const instance = await createCleartextInstance(CONFIG);
    const kp = instance.generateKeypair();
    expect(kp.publicKey).toBeTypeOf("string");
    expect(kp.privateKey).toBeTypeOf("string");
    expect(kp.publicKey.length).toBeGreaterThan(0);
    expect(kp.privateKey.length).toBeGreaterThan(0);
  });

  it("createEncryptedInput returns a builder", async () => {
    const instance = await createCleartextInstance(CONFIG);
    const input = instance.createEncryptedInput(
      CONFIG.cleartextExecutorAddress,
      "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    );
    expect(input.add64).toBeTypeOf("function");
    expect(input.encrypt).toBeTypeOf("function");
  });

  it("getPublicKey returns null", async () => {
    const instance = await createCleartextInstance(CONFIG);
    expect(instance.getPublicKey()).toBeNull();
  });

  it("requestZKProofVerification throws", async () => {
    const instance = await createCleartextInstance(CONFIG);
    await expect(instance.requestZKProofVerification({} as never)).rejects.toThrow(
      "not supported in cleartext mode",
    );
  });
});
