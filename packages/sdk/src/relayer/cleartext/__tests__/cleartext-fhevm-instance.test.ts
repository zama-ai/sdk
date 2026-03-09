import {
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
import type { EIP1193Provider } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { CleartextFhevmInstance } from "../cleartext-fhevm-instance";
import type { Handle } from "../../relayer-sdk.types";
import { MOCK_INPUT_SIGNER_PK, MOCK_KMS_SIGNER_PK } from "../constants";
import { hardhatCleartextConfig } from "../presets";
import { CONTRACT_ADDRESS, USER_ADDRESS } from "./fixtures";

const ACL_ABI = parseAbi([
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
]);

const EXECUTOR_ABI = parseAbi(["function plaintexts(bytes32 handle) view returns (uint256)"]);

type MockClientOptions = {
  persistAllowed?: (handle: string, account: string) => boolean;
  isAllowedForDecryption?: (handle: string) => boolean;
  isHandleDelegatedForUserDecryption?: (delegator: string, delegate: string, contractAddress: string, handle: string) => boolean;
  plaintexts?: Record<string, bigint>;
};
type MockCall = { method: string; params: unknown[] };
type UserDecryptParams = Parameters<CleartextFhevmInstance["userDecrypt"]>[0];
const asHandle = (value: string): Handle => value as Handle;

function createMockProvider(options: MockClientOptions = {}) {
  const calls: MockCall[] = [];

  const provider: EIP1193Provider = {
    async request({ method, params }: { method: string; params?: unknown[] }) {
      const paramList = (params ?? []) as unknown[];
      calls.push({ method, params: paramList });

      if (method === "eth_call") {
        const tx = paramList[0] as { to: string; data: string };
        const to = tx.to.toLowerCase();

        if (to === hardhatCleartextConfig.aclContractAddress.toLowerCase()) {
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

        if (to === hardhatCleartextConfig.executorAddress.toLowerCase()) {
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
    on() {},
    removeListener() {},
  } as EIP1193Provider;

  return { provider, calls };
}

function createInstance(options: MockClientOptions = {}): {
  fhevm: CleartextFhevmInstance;
  calls: MockCall[];
} {
  const { provider, calls } = createMockProvider(options);
  return { fhevm: new CleartextFhevmInstance(hardhatCleartextConfig), calls };
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
  it("constructor uses kms/input private keys from config", () => {
    const customInputKey =
      "0x0000000000000000000000000000000000000000000000000000000000000001" as const;
    const customKmsKey =
      "0x0000000000000000000000000000000000000000000000000000000000000002" as const;

    const customInputSigner = privateKeyToAccount(customInputKey);
    const customKmsSigner = privateKeyToAccount(customKmsKey);

    const fhevm = new CleartextFhevmInstance({
      ...hardhatCleartextConfig,
      inputSignerPrivateKey: customInputKey,
      kmsSignerPrivateKey: customKmsKey,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = fhevm as any;
    expect(instance.inputSigner.address).toBe(customInputSigner.address);
    expect(instance.kmsSigner.address).toBe(customKmsSigner.address);
  });

  it("constructor falls back to default signer keys when none provided", () => {
    const defaultInputSigner = privateKeyToAccount(MOCK_INPUT_SIGNER_PK);
    const defaultKmsSigner = privateKeyToAccount(MOCK_KMS_SIGNER_PK);

    const fhevm = new CleartextFhevmInstance(hardhatCleartextConfig);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = fhevm as any;
    expect(instance.inputSigner.address).toBe(defaultInputSigner.address);
    expect(instance.kmsSigner.address).toBe(defaultKmsSigner.address);
  });

  it("throws when configured with mainnet chain ID", () => {
    const { provider } = createMockProvider();

    expect(
      () =>
        new CleartextFhevmInstance({
          ...hardhatCleartextConfig,
          network: provider,
          chainId: 1,
        }),
    ).toThrow(/not allowed on chain 1/);
  });

  it("throws when configured with Sepolia chain ID", () => {
    const { provider } = createMockProvider();

    expect(
      () =>
        new CleartextFhevmInstance({
          ...hardhatCleartextConfig,
          network: provider,
          chainId: 11155111,
        }),
    ).toThrow(/not allowed on chain 11155111/);
  });

  it("generateKeypair returns distinct 32-byte hex strings", async () => {
    const { fhevm } = createInstance();

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
    const { fhevm } = createInstance();

    const typedData = await fhevm.createEIP712(
      `0x${"ab".repeat(32)}`,
      [CONTRACT_ADDRESS],
      1710000000,
      7,
    );

    expect(typedData.domain).toEqual({
      name: "Decryption",
      version: "1",
      chainId: hardhatCleartextConfig.chainId,
      verifyingContract: hardhatCleartextConfig.verifyingContractAddressDecryption,
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
    const { fhevm } = createInstance();

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
    const { fhevm } = createInstance();

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
    const { fhevm } = createInstance();

    await expect(
      fhevm.encrypt({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        values: [{ value: 1n, type: "euint512" as any }],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      }),
    ).rejects.toThrow(/Unsupported FHE type/);
  });

  it("encrypt proof layout: [numHandles][1][handles...][signature][cleartexts...]", async () => {
    const { fhevm } = createInstance();

    const encrypted = await fhevm.encrypt({
      values: [
        { value: 42n, type: "euint8" },
        { value: 99n, type: "euint8" },
      ],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    const proof = encrypted.inputProof;
    expect(proof[0]).toBe(2); // numHandles
    expect(proof[1]).toBe(1); // version
    expect(proof.length).toBe(195); // 2 + 2*32 + 65 + 2*32

    // Handles in proof match returned handles
    expect(toHex(proof.slice(2, 34))).toBe(toHex(encrypted.handles[0]!));
    expect(toHex(proof.slice(34, 66))).toBe(toHex(encrypted.handles[1]!));

    // Cleartext values at end
    const clear0 = hexToBigInt(toHex(proof.slice(131, 163)));
    const clear1 = hexToBigInt(toHex(proof.slice(163, 195)));
    expect(clear0).toBe(42n);
    expect(clear1).toBe(99n);
  });

  it("encrypt with no values returns empty handles and a proof header", async () => {
    const { fhevm } = createInstance();

    const encrypted = await fhevm.encrypt({
      values: [],
      contractAddress: CONTRACT_ADDRESS,
      userAddress: USER_ADDRESS,
    });

    expect(encrypted.handles).toEqual([]);
    expect(encrypted.inputProof[0]).toBe(0);
    expect(encrypted.inputProof[1]).toBe(1);
    expect(encrypted.inputProof.length).toBe(67); // 2 + 0 handles + 65 sig + 0 cleartexts
  });

  it("encrypt rejects negative values", async () => {
    const { fhevm } = createInstance();

    await expect(
      fhevm.encrypt({
        values: [{ value: -1n, type: "euint8" }],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      }),
    ).rejects.toThrow(/non-negative/i);
  });

  it("encrypt rejects values exceeding bit width", async () => {
    const { fhevm } = createInstance();

    await expect(
      fhevm.encrypt({
        values: [{ value: 256n, type: "euint8" }],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      }),
    ).rejects.toThrow(/exceeds max/i);
  });

  it("encrypt rejects bool values outside 0/1", async () => {
    const { fhevm } = createInstance();

    await expect(
      fhevm.encrypt({
        values: [{ value: 2n, type: "ebool" }],
        contractAddress: CONTRACT_ADDRESS,
        userAddress: USER_ADDRESS,
      }),
    ).rejects.toThrow(/must be 0, 1, true, or false/i);
  });

  it("userDecrypt throws when ACL.persistAllowed returns false", async () => {
    const handle = asHandle("0x" + "12".repeat(32));
    const { fhevm } = createInstance({
      persistAllowed: () => false,
    });

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
    const { fhevm, calls } = createInstance({
      persistAllowed: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });

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

    const persistAllowedCalls = filterEthCallsTo(calls, hardhatCleartextConfig.aclContractAddress);
    const plaintextCalls = filterEthCallsTo(calls, hardhatCleartextConfig.executorAddress);

    expect(persistAllowedCalls).toHaveLength(4);
    expect(plaintextCalls).toHaveLength(2);
  });

  it("userDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls", async () => {
    const handleA = asHandle("0x" + "aa".repeat(32));
    const handleB = asHandle("0x" + "bb".repeat(32));
    const normalizedB = toHex(hexToBigInt(handleB as `0x${string}`), { size: 32 });

    const { fhevm, calls } = createInstance({
      persistAllowed: (handle) => handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 1n,
        [handleB.toLowerCase()]: 2n,
      },
    });

    await expect(
      fhevm.userDecrypt(
        createUserDecryptParams({
          handles: [handleA, handleB],
        }),
      ),
    ).rejects.toThrow(new RegExp(normalizedB));

    const plaintextCalls = filterEthCallsTo(calls, hardhatCleartextConfig.executorAddress);
    expect(plaintextCalls).toHaveLength(0);
  });

  it("userDecrypt checks ACL against both signerAddress and contractAddress", async () => {
    const handle = asHandle("0x" + "cc".repeat(32));
    const persistAllowedAccounts: string[] = [];

    const { fhevm } = createInstance({
      persistAllowed: (_handle, account) => {
        persistAllowedAccounts.push(account);
        return true;
      },
      plaintexts: { [handle.toLowerCase()]: 42n },
    });

    await fhevm.userDecrypt(
      createUserDecryptParams({
        handles: [handle],
      }),
    );

    expect(persistAllowedAccounts).toHaveLength(2);
    const normalized = persistAllowedAccounts.map((a) => a.toLowerCase());
    expect(normalized).toContain(USER_ADDRESS.toLowerCase());
    expect(normalized).toContain(CONTRACT_ADDRESS.toLowerCase());
  });

  it("userDecrypt throws when contract is not authorized", async () => {
    const handle = asHandle("0x" + "cc".repeat(32));
    const { fhevm } = createInstance({
      persistAllowed: (_handle, account) =>
        account.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase(),
      plaintexts: { [handle.toLowerCase()]: 42n },
    });

    await expect(fhevm.userDecrypt(createUserDecryptParams({ handles: [handle] }))).rejects.toThrow(
      /Contract.*not authorized/i,
    );
  });

  it("userDecrypt throws when signer equals contract", async () => {
    const handle = asHandle("0x" + "cc".repeat(32));
    const { fhevm } = createInstance({
      persistAllowed: () => true,
      plaintexts: { [handle.toLowerCase()]: 42n },
    });

    await expect(
      fhevm.userDecrypt(
        createUserDecryptParams({
          handles: [handle],
          signerAddress: CONTRACT_ADDRESS,
          contractAddress: CONTRACT_ADDRESS,
        }),
      ),
    ).rejects.toThrow(/must not equal contract address/i);
  });

  it("userDecrypt preserves handle casing in result keys", async () => {
    const handleUpper = asHandle("0x" + "AB".repeat(32));

    const { fhevm } = createInstance({
      persistAllowed: () => true,
      plaintexts: { [handleUpper.toLowerCase()]: 55n },
    });

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
    const { fhevm } = createInstance({
      persistAllowed: () => true,
      plaintexts: { [boolHandle.toLowerCase()]: 1n },
    });

    const result = await fhevm.userDecrypt(createUserDecryptParams({ handles: [boolHandle] }));

    expect(result[boolHandle]).toBe(true);
  });

  it("userDecrypt decodes ebool handle with value 0 as false", async () => {
    const boolHandle = asHandle("0x" + "01".repeat(30) + "00" + "00");
    const { fhevm } = createInstance({
      persistAllowed: () => true,
      plaintexts: { [boolHandle.toLowerCase()]: 0n },
    });

    const result = await fhevm.userDecrypt(createUserDecryptParams({ handles: [boolHandle] }));

    expect(result[boolHandle]).toBe(false);
  });

  it("userDecrypt decodes eaddress handle as hex string", async () => {
    const addressHandle = asHandle("0x" + "01".repeat(30) + "07" + "00");
    const addressValue = BigInt("0x1000000000000000000000000000000000000001");
    const { fhevm } = createInstance({
      persistAllowed: () => true,
      plaintexts: { [addressHandle.toLowerCase()]: addressValue },
    });

    const result = await fhevm.userDecrypt(createUserDecryptParams({ handles: [addressHandle] }));

    const decoded = result[addressHandle];
    expect(typeof decoded).toBe("string");
    expect(decoded).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("publicDecrypt throws when ACL.isAllowedForDecryption returns false", async () => {
    const handle = asHandle("0x" + "34".repeat(32));
    const { fhevm } = createInstance({
      isAllowedForDecryption: () => false,
    });

    await expect(fhevm.publicDecrypt([handle])).rejects.toThrow(/not allowed/i);
  });

  it("publicDecrypt with partial ACL failure throws with denied handle and makes zero plaintext calls", async () => {
    const handleA = asHandle("0x" + "dd".repeat(32));
    const handleB = asHandle("0x" + "ee".repeat(32));
    const normalizedB = toHex(hexToBigInt(handleB as `0x${string}`), { size: 32 });

    const { fhevm, calls } = createInstance({
      isAllowedForDecryption: (handle) => handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 10n,
        [handleB.toLowerCase()]: 20n,
      },
    });

    await expect(fhevm.publicDecrypt([handleA, handleB])).rejects.toThrow(new RegExp(normalizedB));

    const plaintextCalls = filterEthCallsTo(calls, hardhatCleartextConfig.executorAddress);
    expect(plaintextCalls).toHaveLength(0);
  });

  it("publicDecrypt proof layout is [numSigners=1][kmsSignature]", async () => {
    const handleA = asHandle("0x" + "56".repeat(32));
    const handleB = asHandle("0x" + "78".repeat(32));

    const { fhevm } = createInstance({
      isAllowedForDecryption: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 42n,
        [handleB.toLowerCase()]: 99n,
      },
    });

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
    const { fhevm } = createInstance();

    await expect(fhevm.getPublicKey()).resolves.toBeNull();
    await expect(fhevm.getPublicParams(2048)).resolves.toBeNull();
  });

  it("terminate is a no-op", () => {
    const { fhevm } = createInstance();

    expect(() => fhevm.terminate()).not.toThrow();
  });

  it("createDelegatedUserDecryptEIP712 returns domain and message with delegatorAddress", async () => {
    const { fhevm } = createInstance();

    const typedData = await fhevm.createDelegatedUserDecryptEIP712(
      `0x${"ab".repeat(32)}`,
      [CONTRACT_ADDRESS],
      USER_ADDRESS,
      1710000000,
      7,
    );

    expect(typedData.domain.verifyingContract).toBe(
      hardhatCleartextConfig.verifyingContractAddressDecryption,
    );
    expect(typedData.domain.name).toBe("Decryption");
    expect(typedData.domain.version).toBe("1");
    expect(typedData.message.delegatorAddress).toBe(USER_ADDRESS);
    expect(typedData.message.publicKey).toBe("0x" + "ab".repeat(32));
    expect(typedData.message.contractAddresses).toEqual([CONTRACT_ADDRESS]);
  });

  it("delegatedUserDecrypt throws when delegator is not authorized", async () => {
    const handle = asHandle("0x" + "12".repeat(32));
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const { fhevm, calls } = createInstance({
      persistAllowed: () => false,
    });

    await expect(
      fhevm.delegatedUserDecrypt({
        handles: [handle],
        contractAddress: CONTRACT_ADDRESS,
        signedContractAddresses: [CONTRACT_ADDRESS],
        privateKey: `0x${"01".repeat(32)}` as `0x${string}`,
        publicKey: `0x${"02".repeat(32)}` as `0x${string}`,
        signature: `0x${"03".repeat(65)}` as `0x${string}`,
        delegatorAddress,
        delegateAddress,
        startTimestamp: 1,
        durationDays: 1,
      }),
    ).rejects.toThrow(/Delegator.*not authorized/i);

    const plaintextCalls = filterEthCallsTo(calls, hardhatCleartextConfig.executorAddress);
    expect(plaintextCalls).toHaveLength(0);
  });

  it("delegatedUserDecrypt throws when contract is not authorized", async () => {
    const handle = asHandle("0x" + "12".repeat(32));
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const { fhevm } = createInstance({
      persistAllowed: (_handle, account) =>
        account.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase(),
    });

    await expect(
      fhevm.delegatedUserDecrypt({
        handles: [handle],
        contractAddress: CONTRACT_ADDRESS,
        signedContractAddresses: [CONTRACT_ADDRESS],
        privateKey: `0x${"01".repeat(32)}` as `0x${string}`,
        publicKey: `0x${"02".repeat(32)}` as `0x${string}`,
        signature: `0x${"03".repeat(65)}` as `0x${string}`,
        delegatorAddress,
        delegateAddress,
        startTimestamp: 1,
        durationDays: 1,
      }),
    ).rejects.toThrow(/Contract.*not authorized/i);
  });

  it("delegatedUserDecrypt throws when delegator equals contract", async () => {
    const handle = asHandle("0x" + "12".repeat(32));
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const { fhevm } = createInstance({
      persistAllowed: () => true,
    });

    await expect(
      fhevm.delegatedUserDecrypt({
        handles: [handle],
        contractAddress: CONTRACT_ADDRESS,
        signedContractAddresses: [CONTRACT_ADDRESS],
        privateKey: `0x${"01".repeat(32)}` as `0x${string}`,
        publicKey: `0x${"02".repeat(32)}` as `0x${string}`,
        signature: `0x${"03".repeat(65)}` as `0x${string}`,
        delegatorAddress: CONTRACT_ADDRESS,
        delegateAddress,
        startTimestamp: 1,
        durationDays: 1,
      }),
    ).rejects.toThrow(/must not equal contract address/i);
  });

  it("delegatedUserDecrypt succeeds even when delegate is not authorized (delegate not checked)", async () => {
    const handle = asHandle("0x" + "12".repeat(32));
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const { fhevm } = createInstance({
      persistAllowed: (_handle, account) => account.toLowerCase() !== delegateAddress.toLowerCase(),
      plaintexts: { [handle.toLowerCase()]: 42n },
    });

    const result = await fhevm.delegatedUserDecrypt({
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

    expect(result[handle]).toBe(42n);
  });

  it("delegatedUserDecrypt checks persistAllowed for delegator and contract per handle", async () => {
    const handleA = asHandle("0x" + "01".repeat(32));
    const handleB = asHandle("0x" + "02".repeat(32));
    const delegatorAddress = USER_ADDRESS;
    const delegateAddress = "0x3000000000000000000000000000000000000003";
    const persistAllowedCalls: Array<{ handle: string; account: string }> = [];

    const { fhevm, calls } = createInstance({
      persistAllowed: (handle, account) => {
        persistAllowedCalls.push({ handle, account });
        return true;
      },
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });

    const result = await fhevm.delegatedUserDecrypt({
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

    expect(result[handleA]).toBe(7n);
    expect(result[handleB]).toBe(11n);

    // 2 handles × 2 checks (delegator + contract) = 4 persistAllowed calls
    expect(persistAllowedCalls).toHaveLength(4);
    const accounts = persistAllowedCalls.map((c) => c.account.toLowerCase());
    expect(accounts.filter((a) => a === delegatorAddress.toLowerCase())).toHaveLength(2);
    expect(accounts.filter((a) => a === CONTRACT_ADDRESS.toLowerCase())).toHaveLength(2);

    const callNames = calls
      .filter((call) => call.method === "eth_call")
      .map((call) => {
        const tx = call.params[0] as { to: string; data: string };
        const target = getAddress(tx.to);
        if (target === getAddress(hardhatCleartextConfig.aclContractAddress)) {
          const parsed = decodeFunctionData({
            abi: ACL_ABI,
            data: tx.data as `0x${string}`,
          });
          return parsed?.functionName ?? "unknown";
        }
        if (target === getAddress(hardhatCleartextConfig.executorAddress)) {
          const parsed = decodeFunctionData({
            abi: EXECUTOR_ABI,
            data: tx.data as `0x${string}`,
          });
          return parsed?.functionName ?? "unknown";
        }
        return "unknown";
      });
    expect(callNames).toEqual([
      "persistAllowed",
      "persistAllowed",
      "persistAllowed",
      "persistAllowed",
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

    const { fhevm, calls } = createInstance({
      isHandleDelegatedForUserDecryption: (_delegator, _delegate, _contractAddress, handle) =>
        handle.toLowerCase() !== normalizedB.toLowerCase(),
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });

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

    const delegationCalls = filterEthCallsTo(calls, getAddress(hardhatCleartextConfig.aclContractAddress)).filter((call) => {
      const tx = call.params[0] as { data: string };
      const parsed = decodeFunctionData({ abi: ACL_ABI, data: tx.data as `0x${string}` });
      return parsed?.functionName === "isHandleDelegatedForUserDecryption";
    });
    expect(delegationCalls).toHaveLength(2);

    const executorCalls = filterEthCallsTo(calls, getAddress(hardhatCleartextConfig.executorAddress));
    expect(executorCalls).toHaveLength(0);
  });

  it("delegatedUserDecrypt returns cleartext values when delegation is valid", async () => {
    const handleA = asHandle("0x" + "01".repeat(32));
    const handleB = asHandle("0x" + "02".repeat(32));
    const { fhevm } = createInstance({
      persistAllowed: () => true,
      plaintexts: {
        [handleA.toLowerCase()]: 7n,
        [handleB.toLowerCase()]: 11n,
      },
    });

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

    const { fhevm } = createInstance({
      persistAllowed: () => true,
      plaintexts: {
        [boolHandle.toLowerCase()]: 1n,
        [addressHandle.toLowerCase()]: addressValue,
      },
    });

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
    const { fhevm } = createInstance();

    await expect(fhevm.requestZKProofVerification({} as never)).rejects.toThrow(
      "Not implemented in cleartext mode",
    );
  });
});
