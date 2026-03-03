import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { CLEARTEXT_EXECUTOR_BYTECODE } from "../bytecode";
import { FHEVM_ADDRESSES } from "../constants";
import { CleartextEncryptedInput } from "../encrypted-input";
import { ACL_ABI, CleartextMockFhevm, EXECUTOR_ABI } from "../index";
import {
  CLEAR_TEXT_MOCK_CONFIG,
  CONTRACT_ADDRESS,
  USER_ADDRESS,
} from "./fixtures";

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

const ACL_INTERFACE = new ethers.Interface(ACL_ABI);
const EXECUTOR_INTERFACE = new ethers.Interface(EXECUTOR_ABI);

type MockProviderOptions = {
  implementationAddress?: string;
  persistAllowed?: (handle: string, account: string) => boolean;
  isAllowedForDecryption?: (handle: string) => boolean;
  plaintexts?: Record<string, bigint>;
};

function createMockProvider(options: MockProviderOptions = {}) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const implementationAddress =
    options.implementationAddress ?? "0x9000000000000000000000000000000000000009";

  const provider = {
    async send(method: string, params: unknown[] = []) {
      calls.push({ method, params });

      if (method === "eth_getStorageAt") {
        const normalized = implementationAddress.toLowerCase().replace("0x", "");
        return `0x${"00".repeat(12)}${normalized}`;
      }

      if (method === "hardhat_setCode") {
        return true;
      }

      if (method === "eth_call") {
        const tx = params[0] as { to: string; data: string };
        const to = tx.to.toLowerCase();

        if (to === FHEVM_ADDRESSES.acl.toLowerCase()) {
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

        if (to === FHEVM_ADDRESSES.executor.toLowerCase()) {
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

describe("CleartextMockFhevm", () => {
  it("create patches the implementation code extracted from EIP-1967 slot", async () => {
    const implementationAddress = "0x7000000000000000000000000000000000000007";
    const { provider, calls } = createMockProvider({ implementationAddress });

    await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    expect(calls[0]).toEqual({
      method: "eth_getStorageAt",
      params: [FHEVM_ADDRESSES.executor, EIP1967_IMPLEMENTATION_SLOT, "latest"],
    });
    expect(calls[1]).toEqual({
      method: "hardhat_setCode",
      params: [implementationAddress, CLEARTEXT_EXECUTOR_BYTECODE],
    });
  });

  it("userDecrypt throws when ACL.persistAllowed returns false", async () => {
    const handle = "0x" + "12".repeat(32);
    const { provider } = createMockProvider({
      persistAllowed: () => false,
    });
    const fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.userDecrypt(
        [{ handle, contractAddress: "0x4000000000000000000000000000000000000004" }],
        "0x" + "01".repeat(32),
        "0x" + "02".repeat(32),
        "0x" + "03".repeat(65),
        ["0x4000000000000000000000000000000000000004"],
        "0x5000000000000000000000000000000000000005",
        1,
        1,
      ),
    ).rejects.toThrow(/not authorized/i);
  });

  it("publicDecrypt throws when ACL.isAllowedForDecryption returns false", async () => {
    const handle = "0x" + "34".repeat(32);
    const { provider } = createMockProvider({
      isAllowedForDecryption: () => false,
    });
    const fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

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
    const fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.publicDecrypt([handleA, handleB]);
    const proofBytes = ethers.getBytes(result.decryptionProof);

    expect(proofBytes[0]).toBe(1);
    expect(proofBytes.length).toBe(66);
    expect(result.clearValues[handleA]).toBe(42n);
    expect(result.clearValues[handleB]).toBe(99n);

    const abiValues = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint256[]"],
      result.abiEncodedClearValues,
    )[0] as bigint[];
    expect(abiValues).toEqual([42n, 99n]);
  });

  it("generateKeypair returns distinct 32-byte hex strings", async () => {
    const { provider } = createMockProvider();
    const fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    const first = fhevm.generateKeypair();
    const second = fhevm.generateKeypair();

    expect(first.publicKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(first.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(second.publicKey).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(second.privateKey).toMatch(/^0x[0-9a-fA-F]{64}$/);

    expect(first.publicKey).not.toBe(first.privateKey);
    expect(second.publicKey).not.toBe(second.privateKey);
    expect(first.publicKey).not.toBe(second.publicKey);
    expect(first.privateKey).not.toBe(second.privateKey);
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
    const fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt(
      [
        { handle: handleA, contractAddress: CONTRACT_ADDRESS },
        { handle: handleB, contractAddress: CONTRACT_ADDRESS },
      ],
      "0x" + "11".repeat(32),
      "0x" + "22".repeat(32),
      "0x" + "33".repeat(65),
      [CONTRACT_ADDRESS],
      USER_ADDRESS,
      1,
      1,
    );

    expect(result[handleA]).toBe(7n);
    expect(result[handleB]).toBe(11n);

    const persistAllowedCalls = calls.filter(
      (call) =>
        call.method === "eth_call" &&
        (call.params[0] as { to: string }).to.toLowerCase() === FHEVM_ADDRESSES.acl.toLowerCase(),
    );
    const plaintextCalls = calls.filter(
      (call) =>
        call.method === "eth_call" &&
        (call.params[0] as { to: string }).to.toLowerCase() === FHEVM_ADDRESSES.executor.toLowerCase(),
    );

    expect(persistAllowedCalls).toHaveLength(2);
    expect(plaintextCalls).toHaveLength(2);
  });

  it("createEIP712 returns a typed data payload for user decrypt requests", async () => {
    const { provider } = createMockProvider();
    const fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    const typedData = fhevm.createEIP712(
      "0x" + "ab".repeat(32),
      [CONTRACT_ADDRESS],
      1710000000,
      7,
    );

    expect(typedData.primaryType).toBe("UserDecryptRequestVerification");
    expect(typedData.domain).toEqual({
      name: "Decryption",
      version: "1",
      chainId: CLEAR_TEXT_MOCK_CONFIG.chainId,
      verifyingContract: CLEAR_TEXT_MOCK_CONFIG.verifyingContractAddressDecryption,
    });
    expect(typedData.message).toEqual({
      publicKey: "0x" + "ab".repeat(32),
      contractAddresses: [CONTRACT_ADDRESS],
      startTimestamp: 1710000000n,
      durationDays: 7n,
      extraData: "0x00",
    });
  });

  it("createEncryptedInput returns a working CleartextEncryptedInput instance", async () => {
    const { provider } = createMockProvider();
    const fhevm = await CleartextMockFhevm.create(provider, CLEAR_TEXT_MOCK_CONFIG);

    const encryptedInput = fhevm.createEncryptedInput(CONTRACT_ADDRESS, USER_ADDRESS);

    expect(encryptedInput).toBeInstanceOf(CleartextEncryptedInput);
    const encrypted = await encryptedInput.add8(1n).encrypt();
    expect(encrypted.handles).toHaveLength(1);
  });
});
