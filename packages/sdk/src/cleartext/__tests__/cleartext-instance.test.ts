import { describe, expect, it, vi } from "vitest";

// Mock viem — createPublicClient returns a mock client with readContract
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();

  return {
    ...actual,
    createPublicClient: vi.fn(() => ({
      readContract: vi.fn(async ({ functionName }: { functionName: string }) => {
        // plaintexts(bytes32) → returns 42n
        if (functionName === "plaintexts") return 42n;
        // ACL functions → return true
        return true;
      }),
    })),
  };
});

import type { Address } from "../../relayer/relayer-sdk.types";
import { createCleartextInstance } from "../cleartext-instance";

const CONFIG = {
  network: "http://127.0.0.1:8545",
  chainId: 31337,
  gatewayChainId: 10901,
  aclContractAddress: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  verifyingContractAddressDecryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
  verifyingContractAddressInputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  cleartextExecutorAddress: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  coprocessorSignerPrivateKey: "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901",
  kmsSignerPrivateKey: "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91",
};

const CONTRACT = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24" as Address;
const USER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;

describe("createCleartextInstance", () => {
  it("returns an object with all required methods", () => {
    const instance = createCleartextInstance(CONFIG);

    expect(instance.createEncryptedInput).toBeTypeOf("function");
    expect(instance.generateKeypair).toBeTypeOf("function");
    expect(instance.createEIP712).toBeTypeOf("function");
    expect(instance.publicDecrypt).toBeTypeOf("function");
    expect(instance.userDecrypt).toBeTypeOf("function");
    expect(instance.delegatedUserDecrypt).toBeTypeOf("function");
    expect(instance.encrypt).toBeTypeOf("function");
    expect(instance.terminate).toBeTypeOf("function");
    expect(instance.getPublicKey).toBeTypeOf("function");
    expect(instance.getPublicParams).toBeTypeOf("function");
  });

  it("generateKeypair returns public and private keys", async () => {
    const instance = createCleartextInstance(CONFIG);
    const kp = await instance.generateKeypair();
    expect(kp.publicKey).toBeTypeOf("string");
    expect(kp.privateKey).toBeTypeOf("string");
    expect(kp.publicKey.length).toBeGreaterThan(0);
    expect(kp.privateKey.length).toBeGreaterThan(0);
  });

  it("createEncryptedInput returns a builder", () => {
    const instance = createCleartextInstance(CONFIG);
    const input = instance.createEncryptedInput(CONTRACT, USER);
    expect(input.add64).toBeTypeOf("function");
    expect(input.encrypt).toBeTypeOf("function");
  });

  it("getPublicKey returns mock data", async () => {
    const instance = createCleartextInstance(CONFIG);
    const result = await instance.getPublicKey();
    expect(result).not.toBeNull();
    expect(result!.publicKeyId).toBe("mock-public-key-id");
  });

  it("requestZKProofVerification throws", async () => {
    const instance = createCleartextInstance(CONFIG);
    await expect(instance.requestZKProofVerification({} as never)).rejects.toThrow(
      "not supported in cleartext mode",
    );
  });

  it("getPublicParams returns mock data", async () => {
    const instance = createCleartextInstance(CONFIG);
    const result = await instance.getPublicParams(2048);
    expect(result).not.toBeNull();
    expect(result!.publicParamsId).toBe("mock-public-params-id");
  });

  it("createEIP712 returns correct EIP712 structure", async () => {
    const instance = createCleartextInstance(CONFIG);
    const pubKey = "0xabcd";
    const contracts = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address];
    const result = await instance.createEIP712(pubKey, contracts, 1000, 30);

    expect(result.domain.name).toBe("Decryption");
    expect(result.domain.version).toBe("1");
    expect(result.domain.chainId).toBe(CONFIG.gatewayChainId);
    expect(result.domain.verifyingContract).toBe(CONFIG.verifyingContractAddressDecryption);
    expect(result.types.UserDecryptRequestVerification).toBeDefined();
    expect(result.message.publicKey).toBe(pubKey);
    expect(result.message.contractAddresses).toEqual(contracts);
    expect(result.message.startTimestamp).toBe(1000n);
    expect(result.message.durationDays).toBe(30n);
    expect(result.message.extraData).toBe("0x");
  });

  it("createDelegatedUserDecryptEIP712 returns correct structure", async () => {
    const instance = createCleartextInstance(CONFIG);
    const pubKey = "0xabcd";
    const contracts = ["0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address];
    const delegator = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
    const result = await instance.createDelegatedUserDecryptEIP712(
      pubKey,
      contracts,
      delegator,
      2000,
      7,
    );

    expect(result.domain.name).toBe("Decryption");
    expect(result.domain.chainId).toBe(CONFIG.gatewayChainId);
    expect(result.types.DelegatedUserDecryptRequestVerification).toBeDefined();
    expect(result.message.publicKey).toBe(pubKey);
    expect(result.message.delegatorAddress).toBe(delegator);
    expect(result.message.startTimestamp).toBe(2000n);
    expect(result.message.durationDays).toBe(7n);
  });

  it("publicDecrypt returns bigint clearValues and decryption proof", async () => {
    const instance = createCleartextInstance(CONFIG);
    const handle = "0x" + "00".repeat(32);
    const result = await instance.publicDecrypt([handle]);
    // handle byte 30 = 0x00 → fheTypeId 0 (ebool), mock returns 42n → formatPlaintext(42n, 0) → false → converted to 0n
    expect(result.clearValues[handle]).toBe(0n);
    // Decryption proof: 1 byte numSigners + 65 bytes signature = 66 bytes
    expect(result.decryptionProof).toMatch(/^0x/);
    expect(result.decryptionProof.length).toBe(2 + 66 * 2);
  });

  it("userDecrypt accepts params object", async () => {
    const instance = createCleartextInstance(CONFIG);
    const handle = "0x" + "00".repeat(32);
    const result = await instance.userDecrypt({
      handles: [handle],
      contractAddress: CONTRACT,
      privateKey: "0xprivkey",
      publicKey: "0xpubkey",
      signature: "0xsig",
      signedContractAddresses: [CONTRACT],
      signerAddress: USER,
      startTimestamp: 1000,
      durationDays: 30,
    });
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

  it("resolves custom transport when network is an object (EIP1193Provider)", () => {
    const eip1193Mock = { request: vi.fn() };
    const instance = createCleartextInstance({
      ...CONFIG,
      network: eip1193Mock as never,
    });
    // If it didn't throw, custom transport path was taken
    expect(instance.createEncryptedInput).toBeTypeOf("function");
  });

  it("delegatedUserDecrypt accepts params object", async () => {
    const instance = createCleartextInstance(CONFIG);
    const handle = "0x" + "00".repeat(32);
    const delegator = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
    const delegate = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
    const result = await instance.delegatedUserDecrypt({
      handles: [handle],
      contractAddress: CONTRACT,
      privateKey: "0xprivkey",
      publicKey: "0xpubkey",
      signature: "0xsig",
      signedContractAddresses: [CONTRACT],
      delegatorAddress: delegator,
      delegateAddress: delegate,
      startTimestamp: 1000,
      durationDays: 30,
    });
    // handle is all-zeros → fheTypeId=0 (ebool), mock returns 42n → 42n===1n → false
    expect(result[handle]).toBe(false);
  });

  it("terminate is a no-op", () => {
    const instance = createCleartextInstance(CONFIG);
    expect(() => instance.terminate()).not.toThrow();
  });

  it("encrypt accepts params object with typed values", async () => {
    const instance = createCleartextInstance(CONFIG);
    const result = await instance.encrypt({
      contractAddress: CONTRACT,
      userAddress: USER,
      values: [
        { type: "ebool", value: true },
        { type: "euint64", value: 42n },
      ],
    });
    expect(result.handles).toHaveLength(2);
    expect(result.inputProof).toBeInstanceOf(Uint8Array);
  });

  it("encrypt supports eaddress type", async () => {
    const instance = createCleartextInstance(CONFIG);
    const result = await instance.encrypt({
      contractAddress: CONTRACT,
      userAddress: USER,
      values: [{ type: "eaddress", value: USER } as never],
    });
    expect(result.handles).toHaveLength(1);
    expect(result.inputProof).toBeInstanceOf(Uint8Array);
  });

  it("rejects invalid private key format", () => {
    expect(() =>
      createCleartextInstance({ ...CONFIG, coprocessorSignerPrivateKey: "not-a-key" }),
    ).toThrow("Invalid private key");
  });
});
