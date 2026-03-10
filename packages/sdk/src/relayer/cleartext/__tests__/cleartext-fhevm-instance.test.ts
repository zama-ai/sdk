import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
  hexToBigInt,
  parseAbi,
  toBytes,
  toHex,
  concat,
  pad,
  getAddress,
} from "viem";
import type { PublicClient } from "viem";
import { describe, expect, it } from "vitest";
import { CleartextFhevmInstance } from "../cleartext-fhevm-instance";
import type { Handle } from "../../relayer-sdk.types";
import {
  CLEAR_TEXT_MOCK_CONFIG,
  CONTRACT_ADDRESS,
  TEST_FHEVM_ADDRESSES,
  USER_ADDRESS,
} from "./fixtures";

const ACL_ABI = parseAbi([
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
]);

const EXECUTOR_ABI = parseAbi(["function plaintexts(bytes32 handle) view returns (uint256)"]);

type MockClientOptions = {
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
type MockCall = { method: string; params: unknown[] };
type UserDecryptParams = Parameters<CleartextFhevmInstance["userDecrypt"]>[0];
const asHandle = (value: string): Handle => value as Handle;

function createMockClient(options: MockClientOptions = {}) {
  const calls: MockCall[] = [];

  const client = createPublicClient({
    transport: custom({
      async request({ method, params }: { method: string; params?: unknown[] }) {
        const paramList = params ?? [];
        calls.push({ method, params: paramList });

        if (method === "eth_call") {
          const tx = paramList[0] as { to: string; data: string };
          const to = getAddress(tx.to);

          if (to === getAddress(TEST_FHEVM_ADDRESSES.acl)) {
            const parsed = decodeFunctionData({
              abi: ACL_ABI,
              data: tx.data as `0x${string}`,
            });
            if (!parsed) {
              throw new Error("Unable to parse ACL call");
            }

            if (parsed.functionName === "persistAllowed") {
              const [handle, account] = parsed.args;
              const allowed = options.persistAllowed
                ? options.persistAllowed(String(handle), String(account))
                : true;
              return encodeFunctionResult({
                abi: ACL_ABI,
                functionName: "persistAllowed",
                result: allowed,
              });
            }

            if (parsed.functionName === "isAllowedForDecryption") {
              const [handle] = parsed.args;
              const allowed = options.isAllowedForDecryption
                ? options.isAllowedForDecryption(String(handle))
                : true;
              return encodeFunctionResult({
                abi: ACL_ABI,
                functionName: "isAllowedForDecryption",
                result: allowed,
              });
            }

            if (parsed.functionName === "isHandleDelegatedForUserDecryption") {
              const [delegator, delegate, contractAddress, handle] = parsed.args;
              const isDelegated = options.isHandleDelegatedForUserDecryption
                ? options.isHandleDelegatedForUserDecryption(
                    String(delegator),
                    String(delegate),
                    String(contractAddress),
                    String(handle),
                  )
                : true;
              return encodeFunctionResult({
                abi: ACL_ABI,
                functionName: "isHandleDelegatedForUserDecryption",
                result: isDelegated,
              });
            }
          }

          if (to === getAddress(TEST_FHEVM_ADDRESSES.executor)) {
            const parsed = decodeFunctionData({
              abi: EXECUTOR_ABI,
              data: tx.data as `0x${string}`,
            });
            if (!parsed || parsed.functionName !== "plaintexts") {
              throw new Error("Unable to parse executor call");
            }
            const [handle] = parsed.args;
            const value = options.plaintexts?.[String(handle).toLowerCase()] ?? 0n;
            return encodeFunctionResult({
              abi: EXECUTOR_ABI,
              functionName: "plaintexts",
              result: value,
            });
          }
        }

        throw new Error(`Unexpected provider call: ${method}`);
      },
    }),
  });

  return { client: client as PublicClient, calls };
}

function createUserDecryptParams(
  overrides: Omit<Partial<UserDecryptParams>, "handles"> & { handles: string[] },
): UserDecryptParams {
  const { handles, ...rest } = overrides;
  return {
    handles: handles as Handle[],
    contractAddress: CONTRACT_ADDRESS,
    signedContractAddresses: [CONTRACT_ADDRESS],
    privateKey: `0x${"01".repeat(32)}`,
    publicKey: `0x${"02".repeat(32)}`,
    signature: `0x${"03".repeat(65)}`,
    signerAddress: USER_ADDRESS,
    startTimestamp: 1,
    durationDays: 1,
    ...rest,
  };
}

function filterEthCallsTo(calls: MockCall[], to: string): MockCall[] {
  const target = getAddress(to);
  return calls.filter((call) => {
    if (call.method !== "eth_call") return false;
    const tx = call.params[0] as { to?: string };
    return tx.to !== undefined && getAddress(tx.to) === target;
  });
}

describe("CleartextFhevmInstance", () => {
  it("throws when configured with mainnet chain ID", () => {
    const { client } = createMockClient();

    expect(
      () =>
        new CleartextFhevmInstance(client, {
          ...CLEAR_TEXT_MOCK_CONFIG,
          chainId: 1n,
        }),
    ).toThrow(/not allowed on chain 1/);
  });

  it("throws when configured with Sepolia chain ID", () => {
    const { client } = createMockClient();

    expect(
      () =>
        new CleartextFhevmInstance(client, {
          ...CLEAR_TEXT_MOCK_CONFIG,
          chainId: 11155111n,
        }),
    ).toThrow(/not allowed on chain 11155111/);
  });

  it("generateKeypair returns distinct 32-byte hex strings", async () => {
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

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
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const typedData = await fhevm.createEIP712(
      `0x${"ab".repeat(32)}`,
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
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const encrypted = await fhevm.encrypt({
      values: [
        { value: 42n, type: "euint64" },
        { value: 99n, type: "euint64" },
      ],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(encrypted.handles).toHaveLength(2);
    expect(encrypted.inputProof).toBeInstanceOf(Uint8Array);
    expect(encrypted.inputProof.length).toBeGreaterThan(0);
  });

  it("encrypt dispatches to correct add method based on FHE type", async () => {
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const encrypted = await fhevm.encrypt({
      values: [
        { value: true, type: "ebool" },
        { value: 200n, type: "euint8" },
        { value: 50000n, type: "euint16" },
        { value: 1000000n, type: "euint32" },
        { value: 42n, type: "euint64" },
      ],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(encrypted.handles).toHaveLength(5);
    expect(encrypted.inputProof).toBeInstanceOf(Uint8Array);
  });

  it("encrypt throws on unsupported FHE type", async () => {
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.encrypt({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        values: [{ value: 1n, type: "euint512" as any }],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      }),
    ).rejects.toThrow(/Unsupported FHE type/);
  });

  it("userDecrypt throws when ACL.persistAllowed returns false", async () => {
    const handle = asHandle("0x" + "12".repeat(32));
    const { client } = createMockClient({
      persistAllowed: () => false,
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.userDecrypt(
        createUserDecryptParams({
          handles: [handle],
        }),
      ),
    ).rejects.toThrow(/not authorized/i);
  });

  it("userDecrypt returns cleartext values when ACL allows access", async () => {
    const handleA = asHandle("0x" + "01".repeat(32));
    const handleB = asHandle("0x" + "02".repeat(32));
    const { client, calls } = createMockClient({
      persistAllowed: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt(
      createUserDecryptParams({
        handles: [handleA, handleB],
        privateKey: `0x${"11".repeat(32)}`,
        publicKey: `0x${"22".repeat(32)}`,
        signature: `0x${"33".repeat(65)}`,
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
    const handleA = asHandle("0x" + "aa".repeat(32));
    const handleB = asHandle("0x" + "bb".repeat(32));
    const normalizedB = toHex(hexToBigInt(handleB as `0x${string}`), { size: 32 });

    const { client, calls } = createMockClient({
      persistAllowed: (handle) => handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 1n,
        [handleB.toLowerCase()]: 2n,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

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
    const handle = asHandle("0x" + "cc".repeat(32));
    const persistAllowedAccounts: string[] = [];

    const { client } = createMockClient({
      persistAllowed: (_handle, account) => {
        persistAllowedAccounts.push(account);
        return true;
      },
      plaintexts: { [handle.toLowerCase()]: 42n },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await fhevm.userDecrypt(
      createUserDecryptParams({
        handles: [handle],
      }),
    );

    expect(persistAllowedAccounts.length).toBeGreaterThan(0);
    for (const account of persistAllowedAccounts) {
      expect(getAddress(account)).toBe(getAddress(USER_ADDRESS));
    }
  });

  it("userDecrypt preserves handle casing in result keys", async () => {
    const handleUpper = asHandle("0x" + "AB".repeat(32));

    const { client } = createMockClient({
      persistAllowed: () => true,
      plaintexts: { [handleUpper.toLowerCase()]: 55n },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt(
      createUserDecryptParams({
        handles: [handleUpper],
      }),
    );

    const keys = Object.keys(result);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(handleUpper);
    expect(result[keys[0]! as Handle]).toBe(55n);
  });

  it("userDecrypt decodes ebool handle as boolean", async () => {
    const boolHandle = asHandle("0x" + "01".repeat(30) + "00" + "00");
    const { client } = createMockClient({
      persistAllowed: () => true,
      plaintexts: { [boolHandle.toLowerCase()]: 1n },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt(createUserDecryptParams({ handles: [boolHandle] }));

    expect(result[boolHandle]).toBe(true);
  });

  it("userDecrypt decodes ebool handle with value 0 as false", async () => {
    const boolHandle = asHandle("0x" + "01".repeat(30) + "00" + "00");
    const { client } = createMockClient({
      persistAllowed: () => true,
      plaintexts: { [boolHandle.toLowerCase()]: 0n },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt(createUserDecryptParams({ handles: [boolHandle] }));

    expect(result[boolHandle]).toBe(false);
  });

  it("userDecrypt decodes eaddress handle as hex string", async () => {
    const addressHandle = asHandle("0x" + "01".repeat(30) + "07" + "00");
    const addressValue = BigInt("0x1000000000000000000000000000000000000001");
    const { client } = createMockClient({
      persistAllowed: () => true,
      plaintexts: { [addressHandle.toLowerCase()]: addressValue },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.userDecrypt(createUserDecryptParams({ handles: [addressHandle] }));

    const decoded = result[addressHandle];
    expect(typeof decoded).toBe("string");
    expect(decoded).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("publicDecrypt throws when ACL.isAllowedForDecryption returns false", async () => {
    const handle = asHandle("0x" + "34".repeat(32));
    const { client } = createMockClient({
      isAllowedForDecryption: () => false,
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.publicDecrypt([handle])).rejects.toThrow(/not allowed/i);
  });

  it("publicDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls", async () => {
    const handleA = asHandle("0x" + "dd".repeat(32));
    const handleB = asHandle("0x" + "ee".repeat(32));
    const normalizedB = toHex(hexToBigInt(handleB as `0x${string}`), { size: 32 });

    const { client, calls } = createMockClient({
      isAllowedForDecryption: (handle) => handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 10n,
        [handleB.toLowerCase()]: 20n,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.publicDecrypt([handleA, handleB])).rejects.toThrow(new RegExp(normalizedB));

    const plaintextCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.executor);
    expect(plaintextCalls).toHaveLength(0);
  });

  it("publicDecrypt proof layout is [numSigners=1][kmsSignature]", async () => {
    const handleA = asHandle("0x" + "56".repeat(32));
    const handleB = asHandle("0x" + "78".repeat(32));

    const { client } = createMockClient({
      isAllowedForDecryption: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 42n,
        [handleB.toLowerCase()]: 99n,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.publicDecrypt([handleA, handleB]);
    const proofBytes = toBytes(result.decryptionProof as `0x${string}`);

    expect(proofBytes[0]).toBe(1);
    expect(proofBytes.length).toBe(66);
    expect(result.clearValues[handleA]).toBe(42n);
    expect(result.clearValues[handleB]).toBe(99n);

    const expected = concat([pad(toHex(42n), { size: 32 }), pad(toHex(99n), { size: 32 })]);
    expect(result.abiEncodedClearValues).toBe(expected);
  });

  it("getPublicKey returns null and getPublicParams returns null", async () => {
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.getPublicKey()).resolves.toBeNull();
    await expect(fhevm.getPublicParams(2048)).resolves.toBeNull();
  });

  it("terminate is a no-op", () => {
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    expect(() => fhevm.terminate()).not.toThrow();
  });

  it("createDelegatedUserDecryptEIP712 returns domain and message with delegatorAddress", async () => {
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const typedData = await fhevm.createDelegatedUserDecryptEIP712(
      `0x${"ab".repeat(32)}`,
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
    const handle = asHandle("0x" + "12".repeat(32));
    const normalizedHandle = toHex(hexToBigInt(handle as `0x${string}`), { size: 32 });
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const { client, calls } = createMockClient({
      isHandleDelegatedForUserDecryption: () => false,
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const promise = fhevm.delegatedUserDecrypt({
      handles: [handle],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: `0x${"01".repeat(32)}`,
      publicKey: `0x${"02".repeat(32)}`,
      signature: `0x${"03".repeat(65)}`,
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
    const handleA = asHandle("0x" + "01".repeat(32));
    const handleB = asHandle("0x" + "02".repeat(32));
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const delegationCalls: Array<{
      delegator: string;
      delegate: string;
      contractAddress: string;
      handle: string;
    }> = [];

    const { client, calls } = createMockClient({
      isHandleDelegatedForUserDecryption: (delegator, delegate, contractAddress, handle) => {
        delegationCalls.push({ delegator, delegate, contractAddress, handle });
        return true;
      },
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await fhevm.delegatedUserDecrypt({
      handles: [handleA, handleB],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: `0x${"11".repeat(32)}`,
      publicKey: `0x${"22".repeat(32)}`,
      signature: `0x${"33".repeat(65)}`,
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
        const target = getAddress(tx.to);
        if (target === getAddress(TEST_FHEVM_ADDRESSES.acl)) {
          const parsed = decodeFunctionData({
            abi: ACL_ABI,
            data: tx.data as `0x${string}`,
          });
          return parsed?.functionName ?? "unknown";
        }
        if (target === getAddress(TEST_FHEVM_ADDRESSES.executor)) {
          const parsed = decodeFunctionData({
            abi: EXECUTOR_ABI,
            data: tx.data as `0x${string}`,
          });
          return parsed?.functionName ?? "unknown";
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
    const handleA = asHandle("0x" + "a1".repeat(32));
    const handleB = asHandle("0x" + "b2".repeat(32));
    const normalizedB = toHex(hexToBigInt(handleB as `0x${string}`), { size: 32 });
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";

    const { client, calls } = createMockClient({
      isHandleDelegatedForUserDecryption: (_delegator, _delegate, _contractAddress, handle) =>
        handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await expect(
      fhevm.delegatedUserDecrypt({
        handles: [handleA, handleB],
        contractAddress: CONTRACT_ADDRESS,
        signedContractAddresses: [CONTRACT_ADDRESS],
        privateKey: `0x${"01".repeat(32)}`,
        publicKey: `0x${"02".repeat(32)}`,
        signature: `0x${"03".repeat(65)}`,
        delegatorAddress,
        delegateAddress,
        startTimestamp: 1,
        durationDays: 1,
      }),
    ).rejects.toThrow(new RegExp(normalizedB));

    const delegationCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.acl).filter((call) => {
      const tx = call.params[0] as { data: string };
      const parsed = decodeFunctionData({ abi: ACL_ABI, data: tx.data as `0x${string}` });
      return parsed?.functionName === "isHandleDelegatedForUserDecryption";
    });
    expect(delegationCalls).toHaveLength(2);

    const executorCalls = filterEthCallsTo(calls, TEST_FHEVM_ADDRESSES.executor);
    expect(executorCalls).toHaveLength(0);
  });

  it("delegatedUserDecrypt returns cleartext values when delegation is valid", async () => {
    const handleA = asHandle("0x" + "01".repeat(32));
    const handleB = asHandle("0x" + "02".repeat(32));
    const { client } = createMockClient({
      isHandleDelegatedForUserDecryption: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.delegatedUserDecrypt({
      handles: [handleA, handleB],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: `0x${"11".repeat(32)}`,
      publicKey: `0x${"22".repeat(32)}`,
      signature: `0x${"33".repeat(65)}`,
      delegatorAddress: USER_ADDRESS,
      delegateAddress: "0x3000000000000000000000000000000000000003",
      startTimestamp: 1,
      durationDays: 1,
    });

    expect(result[handleA]).toBe(7n);
    expect(result[handleB]).toBe(11n);
  });

  it("delegatedUserDecrypt decodes ebool and eaddress handles", async () => {
    const boolHandle = asHandle("0x" + "01".repeat(30) + "00" + "00");
    const addressHandle = asHandle("0x" + "01".repeat(30) + "07" + "00");
    const addressValue = BigInt("0x1000000000000000000000000000000000000001");

    const { client } = createMockClient({
      isHandleDelegatedForUserDecryption: () => true,
      plaintexts: {
        [boolHandle.toLowerCase()]: 1n,
        [addressHandle.toLowerCase()]: addressValue,
      },
    });
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    const result = await fhevm.delegatedUserDecrypt({
      handles: [boolHandle, addressHandle],
      contractAddress: CONTRACT_ADDRESS,
      signedContractAddresses: [CONTRACT_ADDRESS],
      privateKey: `0x${"11".repeat(32)}`,
      publicKey: `0x${"22".repeat(32)}`,
      signature: `0x${"33".repeat(65)}`,
      delegatorAddress: USER_ADDRESS,
      delegateAddress: "0x3000000000000000000000000000000000000003",
      startTimestamp: 1,
      durationDays: 1,
    });

    expect(result[boolHandle]).toBe(true);
    const addressResult = result[addressHandle];
    expect(typeof addressResult).toBe("string");
    expect(addressResult).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("requestZKProofVerification throws in cleartext mode", async () => {
    const { client } = createMockClient();
    const fhevm = new CleartextFhevmInstance(client, CLEAR_TEXT_MOCK_CONFIG);

    await expect(fhevm.requestZKProofVerification({} as never)).rejects.toThrow(
      "Not implemented in cleartext mode",
    );
  });
});
