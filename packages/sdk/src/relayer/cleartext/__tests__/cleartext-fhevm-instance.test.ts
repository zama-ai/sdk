import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import { ACL_ABI, CleartextFhevmInstance, EXECUTOR_ABI } from "../cleartext-fhevm-instance";
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
  isHandleDelegatedForUserDecryption?: (
    delegator: string,
    delegate: string,
    contractAddress: string,
    handle: string,
  ) => boolean;
  plaintexts?: Record<string, bigint>;
};
type JsonRpcSendParams = Parameters<ethers.JsonRpcProvider["send"]>[1];
type MockProviderCall = { method: string; params: unknown[] };
type UserDecryptParams = Parameters<CleartextFhevmInstance["userDecrypt"]>[0];

function createMockProvider(options: MockProviderOptions = {}) {
  const calls: MockProviderCall[] = [];

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

          if (parsed.name === "isHandleDelegatedForUserDecryption") {
            const [delegator, delegate, contractAddress, handle] = parsed.args;
            const isDelegated = options.isHandleDelegatedForUserDecryption
              ? options.isHandleDelegatedForUserDecryption(
                  String(delegator),
                  String(delegate),
                  String(contractAddress),
                  String(handle),
                )
              : true;
            return ACL_INTERFACE.encodeFunctionResult("isHandleDelegatedForUserDecryption", [
              isDelegated,
            ]);
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

function createUserDecryptParams(
  overrides: Partial<UserDecryptParams> & Pick<UserDecryptParams, "handles">,
): UserDecryptParams {
  const { handles, ...rest } = overrides;
  return {
    handles,
    contractAddress: CONTRACT_ADDRESS,
    signedContractAddresses: [CONTRACT_ADDRESS],
    privateKey: "0x" + "01".repeat(32),
    publicKey: "0x" + "02".repeat(32),
    signature: "0x" + "03".repeat(65),
    signerAddress: USER_ADDRESS,
    startTimestamp: 1,
    durationDays: 1,
    ...rest,
  };
}

function filterEthCallsTo(calls: MockProviderCall[], to: string): MockProviderCall[] {
  const normalizedTo = to.toLowerCase();
  return calls.filter((call) => {
    if (call.method !== "eth_call") return false;
    const tx = call.params[0] as { to?: string };
    return tx.to?.toLowerCase() === normalizedTo;
  });
}

describe("CleartextFhevmInstance", () => {
  it("throws when configured with mainnet chain ID", () => {
    const { provider } = createMockProvider();

    expect(
      () =>
        new CleartextFhevmInstance(provider, {
          ...CLEAR_TEXT_MOCK_CONFIG,
          chainId: 1n,
        }),
    ).toThrow(/not allowed on chain 1/);
  });

  it("throws when configured with Sepolia chain ID", () => {
    const { provider } = createMockProvider();

    expect(
      () =>
        new CleartextFhevmInstance(provider, {
          ...CLEAR_TEXT_MOCK_CONFIG,
          chainId: 11155111n,
        }),
    ).toThrow(/not allowed on chain 11155111/);
  });

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
      verifyingContract: CLEAR_TEXT_MOCK_CONFIG.contracts.verifyingDecryption,
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
      fhevm.userDecrypt(
        createUserDecryptParams({
          handles: [handle],
        }),
      ),
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

    const result = await fhevm.userDecrypt(
      createUserDecryptParams({
        handles: [handleA, handleB],
        privateKey: "0x" + "11".repeat(32),
        publicKey: "0x" + "22".repeat(32),
        signature: "0x" + "33".repeat(65),
      }),
    );

    expect(result[handleA]).toBe(7n);
    expect(result[handleB]).toBe(11n);

    const persistAllowedCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.acl);
    const plaintextCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.executor);

    expect(persistAllowedCalls).toHaveLength(2);
    expect(plaintextCalls).toHaveLength(2);
  });

  it("userDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls", async () => {
    const handleA = "0x" + "aa".repeat(32);
    const handleB = "0x" + "bb".repeat(32);
    const normalizedB = ethers.toBeHex(ethers.toBigInt(handleB), 32);

    const { provider, calls } = createMockProvider({
      persistAllowed: (handle) => handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 1n,
        [handleB.toLowerCase()]: 2n,
      },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.userDecrypt(
        createUserDecryptParams({
          handles: [handleA, handleB],
        }),
      ),
    ).rejects.toThrow(new RegExp(normalizedB));

    const plaintextCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.executor);
    expect(plaintextCalls).toHaveLength(0);
  });

  it("userDecrypt checks ACL against signerAddress not contractAddress", async () => {
    const handle = "0x" + "cc".repeat(32);
    const persistAllowedAccounts: string[] = [];

    const { provider } = createMockProvider({
      persistAllowed: (_handle, account) => {
        persistAllowedAccounts.push(account);
        return true;
      },
      plaintexts: { [handle.toLowerCase()]: 42n },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await fhevm.userDecrypt(
      createUserDecryptParams({
        handles: [handle],
      }),
    );

    expect(persistAllowedAccounts.length).toBeGreaterThan(0);
    for (const account of persistAllowedAccounts) {
      expect(account.toLowerCase()).toBe(USER_ADDRESS.toLowerCase());
    }
  });

  it("userDecrypt normalizes uppercase hex handles to lowercase 0x-prefixed 66-char keys", async () => {
    const handleUpper = "0x" + "AB".repeat(32);
    const normalizedHandle = ethers.toBeHex(ethers.toBigInt(handleUpper), 32);

    const { provider } = createMockProvider({
      persistAllowed: () => true,
      plaintexts: { [normalizedHandle.toLowerCase()]: 55n },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt(
      createUserDecryptParams({
        handles: [handleUpper],
      }),
    );

    const keys = Object.keys(result);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result[keys[0]!]).toBe(55n);
  });

  it("publicDecrypt throws when ACL.isAllowedForDecryption returns false", async () => {
    const handle = "0x" + "34".repeat(32);
    const { provider } = createMockProvider({
      isAllowedForDecryption: () => false,
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.publicDecrypt([handle])).rejects.toThrow(/not allowed/i);
  });

  it("publicDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls", async () => {
    const handleA = "0x" + "dd".repeat(32);
    const handleB = "0x" + "ee".repeat(32);
    const normalizedB = ethers.toBeHex(ethers.toBigInt(handleB), 32);

    const { provider, calls } = createMockProvider({
      isAllowedForDecryption: (handle) => handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 10n,
        [handleB.toLowerCase()]: 20n,
      },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.publicDecrypt([handleA, handleB])).rejects.toThrow(new RegExp(normalizedB));

    const plaintextCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.executor);
    expect(plaintextCalls).toHaveLength(0);
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

  it("createDelegatedUserDecryptEIP712 returns domain and message with delegatorAddress", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const typedData = await fhevm.createDelegatedUserDecryptEIP712(
      "0x" + "ab".repeat(32),
      [CONTRACT_ADDRESS],
      USER_ADDRESS,
      1710000000,
      7,
    );

    expect(typedData.domain.verifyingContract).toBe(
      CLEAR_TEXT_MOCK_CONFIG.contracts.verifyingDecryption,
    );
    expect(typedData.domain.name).toBe("Decryption");
    expect(typedData.domain.version).toBe("1");
    expect(typedData.message.delegatorAddress).toBe(USER_ADDRESS);
    expect(typedData.message.publicKey).toBe("0x" + "ab".repeat(32));
    expect(typedData.message.contractAddresses).toEqual([CONTRACT_ADDRESS]);
  });

  it("delegatedUserDecrypt throws when delegation check returns false", async () => {
    const handle = "0x" + "12".repeat(32);
    const normalizedHandle = ethers.toBeHex(ethers.toBigInt(handle), 32);
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const { provider, calls } = createMockProvider({
      isHandleDelegatedForUserDecryption: () => false,
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const promise = fhevm.delegatedUserDecrypt({
      handles: [handle],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: "0x" + "01".repeat(32),
      publicKey: "0x" + "02".repeat(32),
      signature: "0x" + "03".repeat(65),
      delegatorAddress,
      delegateAddress,
      startTimestamp: 1,
      durationDays: 1,
    });

    await expect(promise).rejects.toThrow(normalizedHandle);
    await expect(promise).rejects.toThrow(delegatorAddress);
    await expect(promise).rejects.toThrow(delegateAddress);
    await expect(promise).rejects.toThrow(CONTRACT_ADDRESS);

    const plaintextCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.executor);
    expect(plaintextCalls).toHaveLength(0);
  });

  it("delegatedUserDecrypt calls isHandleDelegatedForUserDecryption for each handle", async () => {
    const handleA = "0x" + "01".repeat(32);
    const handleB = "0x" + "02".repeat(32);
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const delegationCalls: Array<{
      delegator: string;
      delegate: string;
      contractAddress: string;
      handle: string;
    }> = [];

    const { provider, calls } = createMockProvider({
      isHandleDelegatedForUserDecryption: (delegator, delegate, contractAddress, handle) => {
        delegationCalls.push({ delegator, delegate, contractAddress, handle });
        return true;
      },
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await fhevm.delegatedUserDecrypt({
      handles: [handleA, handleB],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: "0x" + "11".repeat(32),
      publicKey: "0x" + "22".repeat(32),
      signature: "0x" + "33".repeat(65),
      delegatorAddress,
      delegateAddress,
      startTimestamp: 1,
      durationDays: 1,
    });

    expect(delegationCalls).toHaveLength(2);
    expect(delegationCalls.map((call) => call.handle.toLowerCase())).toEqual([
      handleA.toLowerCase(),
      handleB.toLowerCase(),
    ]);
    expect(delegationCalls).toEqual([
      {
        delegator: delegatorAddress,
        delegate: delegateAddress,
        contractAddress: CONTRACT_ADDRESS,
        handle: handleA.toLowerCase(),
      },
      {
        delegator: delegatorAddress,
        delegate: delegateAddress,
        contractAddress: CONTRACT_ADDRESS,
        handle: handleB.toLowerCase(),
      },
    ]);

    const callNames = calls
      .filter((call) => call.method === "eth_call")
      .map((call) => {
        const tx = call.params[0] as { to: string; data: string };
        const target = tx.to.toLowerCase();
        if (target === TEST_FHEVM_ADDRESSES.acl.toLowerCase()) {
          return ACL_INTERFACE.parseTransaction({ data: tx.data })?.name ?? "unknown";
        }
        if (target === TEST_FHEVM_ADDRESSES.executor.toLowerCase()) {
          return EXECUTOR_INTERFACE.parseTransaction({ data: tx.data })?.name ?? "unknown";
        }
        return "unknown";
      });
    expect(callNames).toEqual([
      "isHandleDelegatedForUserDecryption",
      "isHandleDelegatedForUserDecryption",
      "plaintexts",
      "plaintexts",
    ]);
  });

  it("delegatedUserDecrypt partial delegation failure throws with second handle and makes exactly 2 delegation calls", async () => {
    const handleA = "0x" + "a1".repeat(32);
    const handleB = "0x" + "b2".repeat(32);
    const normalizedB = ethers.toBeHex(ethers.toBigInt(handleB), 32);
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";

    const { provider, calls } = createMockProvider({
      isHandleDelegatedForUserDecryption: (_delegator, _delegate, _contractAddress, handle) =>
        handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.delegatedUserDecrypt({
        handles: [handleA, handleB],
        contractAddress: CONTRACT_ADDRESS,
        signedContractAddresses: [CONTRACT_ADDRESS],
        privateKey: "0x" + "01".repeat(32),
        publicKey: "0x" + "02".repeat(32),
        signature: "0x" + "03".repeat(65),
        delegatorAddress,
        delegateAddress,
        startTimestamp: 1,
        durationDays: 1,
      }),
    ).rejects.toThrow(new RegExp(normalizedB));

    const delegationCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.acl).filter((call) => {
      const tx = call.params[0] as { data: string };
      const parsed = ACL_INTERFACE.parseTransaction({ data: tx.data });
      return parsed?.name === "isHandleDelegatedForUserDecryption";
    });
    expect(delegationCalls).toHaveLength(2);

    const executorCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.executor);
    expect(executorCalls).toHaveLength(0);
  });

  it("delegatedUserDecrypt returns cleartext values when delegation is valid", async () => {
    const handleA = "0x" + "01".repeat(32);
    const handleB = "0x" + "02".repeat(32);
    const { provider } = createMockProvider({
      isHandleDelegatedForUserDecryption: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.delegatedUserDecrypt({
      handles: [handleA, handleB],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: "0x" + "11".repeat(32),
      publicKey: "0x" + "22".repeat(32),
      signature: "0x" + "33".repeat(65),
      delegatorAddress: USER_ADDRESS,
      delegateAddress: "0x3000000000000000000000000000000000000003",
      startTimestamp: 1,
      durationDays: 1,
    });

    expect(result[handleA]).toBe(7n);
    expect(result[handleB]).toBe(11n);
  });

  it("requestZKProofVerification throws in cleartext mode", async () => {
    const { provider } = createMockProvider();
    const fhevm = new CleartextFhevmInstance(provider, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.requestZKProofVerification({} as never)).rejects.toThrow(
      "Not implemented in cleartext mode",
    );
  });
});
