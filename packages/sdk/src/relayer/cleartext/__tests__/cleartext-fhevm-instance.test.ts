import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
  ACL_ABI,
  CleartextFhevmInstance,
  EXECUTOR_ABI,
} from "../cleartext-fhevm-instance";
import {
  CLEAR_TEXT_MOCK_CONFIG,
  CONTRACT_ADDRESS,
  TEST_FHEVM_ADDRESSES,
  USER_ADDRESS,
} from "./fixtures";

const ACL_INTERFACE = new ethers.Interface(ACL_ABI);
const EXECUTOR_INTERFACE = new ethers.Interface(EXECUTOR_ABI);

type MockProviderOptions = {
  persistAllowed?: (handle: string, account: string) => boolean;
  isAllowedForDecryption?: (handle: string) => boolean;
  plaintexts?: Record<string, bigint>;
};
type JsonRpcSendParams = Parameters<ethers.JsonRpcProvider["send"]>[1];

function createMockProvider(options: MockProviderOptions = {}) {
  const calls: Array<{ method: string; params: unknown[] }> = [];

  const provider: Pick<ethers.JsonRpcProvider, "send"> = {
    async send(method: string, params: JsonRpcSendParams = []) {
      const paramList = Array.isArray(params) ? (params as unknown[]) : [params];
      calls.push({ method, params: paramList });

      if (method === "eth_call") {
        const tx = paramList[0] as { to: string; data: string };
        const to = tx.to.toLowerCase();

        if (to === TEST_FHEVM_ADDRESSES.acl.toLowerCase()) {
          const parsed = ACL_INTERFACE.parseTransaction({ data: tx.data });
          if (!parsed) {
            throw new Error("Unable to parse ACL call");
          }

          if (parsed.name === "persistAllowed") {
            const [handle, account] = parsed.args;
            const allowed = options.persistAllowed
              ? options.persistAllowed(String(handle), String(account))
              : true;
            return ACL_INTERFACE.encodeFunctionResult("persistAllowed", [allowed]);
          }

          if (parsed.name === "isAllowedForDecryption") {
            const [handle] = parsed.args;
            const allowed = options.isAllowedForDecryption
              ? options.isAllowedForDecryption(String(handle))
              : true;
            return ACL_INTERFACE.encodeFunctionResult("isAllowedForDecryption", [allowed]);
          }
        }

        if (to === TEST_FHEVM_ADDRESSES.executor.toLowerCase()) {
          const parsed = EXECUTOR_INTERFACE.parseTransaction({ data: tx.data });
          if (!parsed || parsed.name !== "plaintexts") {
            throw new Error("Unable to parse executor call");
          }
          const [handle] = parsed.args;
          const value = options.plaintexts?.[String(handle).toLowerCase()] ?? 0n;
          return EXECUTOR_INTERFACE.encodeFunctionResult("plaintexts", [value]);
        }
      }

      throw new Error(`Unexpected provider call: ${method}`);
    },
  };

  return { provider, calls };
}

describe("CleartextFhevmInstance", () => {
  it("generateKeypair returns distinct 32-byte hex strings", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const first = await fhevm.generateKeypair();
    const second = await fhevm.generateKeypair();

    expect(first.publicKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(first.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(second.publicKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(second.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);

    expect(first.publicKey).not.toBe(first.privateKey);
    expect(second.publicKey).not.toBe(second.privateKey);
    expect(first.publicKey).not.toBe(second.publicKey);
    expect(first.privateKey).not.toBe(second.privateKey);
  });

  it("createEIP712 returns a typed data payload for user decrypt requests", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const typedData = await fhevm.createEIP712(
      "0x" + "ab".repeat(32),
      [CONTRACT_ADDRESS],
      1710000000,
      7,
    );

    expect(typedData.domain).toEqual({
      name: "Decryption",
      version: "1",
      chainId: Number(CLEAR_TEXT_MOCK_CONFIG.chainId),
      verifyingContract: CLEAR_TEXT_MOCK_CONFIG.verifyingContractAddressDecryption,
    });
    expect(typedData.types.UserDecryptRequestVerification!.map((field) => field.name)).toEqual([
      "publicKey",
      "contractAddresses",
      "startTimestamp",
      "durationDays",
      "extraData",
    ]);
    expect(typedData.message).toEqual({
      publicKey: "0x" + "ab".repeat(32),
      contractAddresses: [CONTRACT_ADDRESS],
      startTimestamp: 1710000000n,
      durationDays: 7n,
      extraData: "0x00",
    });
  });

  it("encrypt returns handles and input proof bytes", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const encrypted = await fhevm.encrypt({
      values: [42n, 99n],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(encrypted.handles).toHaveLength(2);
    expect(encrypted.inputProof).toBeInstanceOf(Uint8Array);
    expect(encrypted.inputProof.length).toBeGreaterThan(0);
  });

  it("userDecrypt throws when ACL.persistAllowed returns false", async () => {
    const handle = "0x" + "12".repeat(32);
    const { provider } = createMockProvider({
      persistAllowed: () => false,
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.userDecrypt({
        handles: [handle],
        contractAddress: CONTRACT_ADDRESS,
        signedContractAddresses: [CONTRACT_ADDRESS],
        privateKey: "0x" + "01".repeat(32),
        publicKey: "0x" + "02".repeat(32),
        signature: "0x" + "03".repeat(65),
        signerAddress: USER_ADDRESS,
        startTimestamp: 1,
        durationDays: 1,
      }),
    ).rejects.toThrow(/not authorized/i);
  });

  it("userDecrypt returns cleartext values when ACL allows access", async () => {
    const handleA = "0x" + "01".repeat(32);
    const handleB = "0x" + "02".repeat(32);
    const { provider, calls } = createMockProvider({
      persistAllowed: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt({
      handles: [handleA, handleB],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: "0x" + "11".repeat(32),
      publicKey: "0x" + "22".repeat(32),
      signature: "0x" + "33".repeat(65),
      signerAddress: USER_ADDRESS,
      startTimestamp: 1,
      durationDays: 1,
    });

    expect(result[handleA]).toBe(7n);
    expect(result[handleB]).toBe(11n);

    const persistAllowedCalls = calls.filter(
      (call) =>
        call.method === "eth_call" &&
        (call.params[0] as { to: string }).to.toLowerCase() === TEST_FHEVM_ADDRESSES.acl.toLowerCase(),
    );
    const plaintextCalls = calls.filter(
      (call) =>
        call.method === "eth_call" &&
        (call.params[0] as { to: string }).to.toLowerCase() ===
          TEST_FHEVM_ADDRESSES.executor.toLowerCase(),
    );

    expect(persistAllowedCalls).toHaveLength(2);
    expect(plaintextCalls).toHaveLength(2);
  });

  it("publicDecrypt throws when ACL.isAllowedForDecryption returns false", async () => {
    const handle = "0x" + "34".repeat(32);
    const { provider } = createMockProvider({
      isAllowedForDecryption: () => false,
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.publicDecrypt([handle])).rejects.toThrow(/not allowed/i);
  });

  it("publicDecrypt proof layout is [numSigners=1][kmsSignature]", async () => {
    const handleA = "0x" + "56".repeat(32);
    const handleB = "0x" + "78".repeat(32);

    const { provider } = createMockProvider({
      isAllowedForDecryption: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 42n,
        [handleB.toLowerCase()]: 99n,
      },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.publicDecrypt([handleA, handleB]);
    const proofBytes = ethers.getBytes(result.decryptionProof);

    expect(proofBytes[0]).toBe(1);
    expect(proofBytes.length).toBe(66);
    expect(result.clearValues[handleA]).toBe(42n);
    expect(result.clearValues[handleB]).toBe(99n);

    const expected = ethers.hexlify(
      ethers.concat([
        ethers.zeroPadValue(ethers.toBeHex(42n), 32),
        ethers.zeroPadValue(ethers.toBeHex(99n), 32),
      ]),
    );
    expect(result.abiEncodedClearValues).toBe(expected);
  });

  it("getPublicKey returns null and getPublicParams returns null", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.getPublicKey()).resolves.toBeNull();
    await expect(fhevm.getPublicParams(2048)).resolves.toBeNull();
  });

  it("terminate is a no-op", () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    expect(() => fhevm.terminate()).not.toThrow();
  });

  it("createDelegatedUserDecryptEIP712 throws in cleartext mode", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.createDelegatedUserDecryptEIP712(
        "0x" + "11".repeat(32),
        [CONTRACT_ADDRESS],
        USER_ADDRESS,
        1,
        1,
      ),
    ).rejects.toThrow("Not implemented in cleartext mode");
  });

  it("delegatedUserDecrypt throws in cleartext mode", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.delegatedUserDecrypt({
        handles: ["0x" + "11".repeat(32)],
        contractAddress: CONTRACT_ADDRESS,
        signedContractAddresses: [CONTRACT_ADDRESS],
        privateKey: "0x" + "11".repeat(32),
        publicKey: "0x" + "22".repeat(32),
        signature: "0x" + "33".repeat(65),
        delegatorAddress: USER_ADDRESS,
        delegateAddress: "0x3000000000000000000000000000000000000003",
        startTimestamp: 1,
        durationDays: 1,
      }),
    ).rejects.toThrow("Not implemented in cleartext mode");
  });

  it("requestZKProofVerification throws in cleartext mode", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.requestZKProofVerification({} as never),
    ).rejects.toThrow("Not implemented in cleartext mode");
  });
});
