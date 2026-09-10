import { storage, fixture, decode, decodeValue, testServer } from "./support/harness.js";

import { randomUUID } from "node:crypto";
import { Metadata, type ServiceError } from "@grpc/grpc-js";
import {
  BaseSigner,
  anvil,
  SigningRejectedError,
  RevokedKmsContextError,
  DecryptionFailedError,
  RpcRateLimitError,
  type EIP712TypedData,
  type Hex,
} from "@zama-fhe/sdk";
import { bytesToHex, hexToBytes } from "viem";
import { expect, test, vi } from "vitest";

import {
  USER,
  TOKEN,
  TEST_SIGNATURE,
  VALID_ENCRYPTED_VALUE,
} from "../../sdk/src/test-fixtures/constants.js";

import type {
  ClearEntry,
  DelegatedBatchDecryptValuesResponse,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";

class LocalSigner extends BaseSigner {
  sign = vi.fn(async (_: EIP712TypedData): Promise<Hex> => TEST_SIGNATURE);
  constructor() {
    super({ address: USER, chainId: anvil.id });
  }
  override signTypedData(data: EIP712TypedData): Promise<Hex> {
    return this.sign(data);
  }
  override async writeContract(): Promise<Hex> {
    throw new Error("No transaction expected");
  }
}
async function harness(signerEnabled = true, backing = storage(), permitTTL?: number) {
  const fixtures: ReturnType<typeof fixture>[] = [];
  const server = await testServer(async (_, signer) => {
    const value = fixture(signer, backing, permitTTL);
    fixtures.push(value);
    return { sdk: value.sdk, storageIdentities: ["shared-fixture"] };
  });
  const { client } = server;
  const created = await new Promise<string>((resolve, reject) =>
    client.createContext(
      {
        storage: undefined,
        permitStorage: undefined,
        configJson: "{}",
        signerEnabled,
        account: signerEnabled
          ? { address: Buffer.from(hexToBytes(USER)), chainId: BigInt(anvil.id) }
          : undefined,
      },
      (error, value) => (error ? reject(error) : resolve(value.contextId)),
    ),
  );
  const local = new LocalSigner();
  if (signerEnabled) {
    await server.attachSigner(created, (action) =>
      local.signTypedData(JSON.parse(action.typedDataJson)),
    );
  }
  const operation = () => ({ contextId: created, operationId: randomUUID() });
  const encryptedInputs = [{ encryptedValue: VALID_ENCRYPTED_VALUE, contractAddress: TOKEN }];
  const inputs = encryptedInputs.map((input) => ({
    encryptedValue: Buffer.from(hexToBytes(input.encryptedValue)),
    contractAddress: Buffer.from(hexToBytes(input.contractAddress)),
  }));
  return {
    client,
    local,
    fixtures,
    operation,
    inputs,
    encryptedInputs,
    decrypt: (requestedInputs = inputs) =>
      new Promise<Record<string, unknown>>((resolve, reject) =>
        client.decryptValues(
          { operation: operation(), inputs: requestedInputs, timeoutMs: undefined },
          new Metadata(),
          { deadline: Date.now() + 3000 },
          (error, result) => (error ? reject(error) : resolve(decode(result.values))),
        ),
      ),
    close: server.close,
  };
}

test("direct SDK and wire decryption acquire once, cache, and reuse persisted permits", async () => {
  const directSigner = new LocalSigner();
  const direct = fixture(directSigner);
  const remote = await harness();
  try {
    const expected = await direct.sdk.decryption.decryptValues(remote.encryptedInputs);
    expect(await remote.decrypt()).toEqual(expected);
    expect(directSigner.sign).toHaveBeenCalledTimes(1);
    expect(remote.local.sign).toHaveBeenCalledTimes(1);
    expect(await remote.decrypt()).toEqual(
      await direct.sdk.decryption.decryptValues(remote.encryptedInputs),
    );
    expect(remote.local.sign).toHaveBeenCalledTimes(1);
    expect(remote.fixtures[0]?.relayer.decryptValues).toHaveBeenCalledTimes(1);
    await new Promise<void>((resolve, reject) =>
      remote.client.grantPermit(
        { operation: remote.operation(), contractAddresses: [Buffer.from(hexToBytes(TOKEN))] },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    expect(remote.local.sign).toHaveBeenCalledTimes(1);
  } finally {
    direct.sdk.dispose();
    directSigner.dispose();
    await remote.close();
  }
});

test("wallet rejection retains the canonical SDK error code", async () => {
  const directSigner = new LocalSigner();
  directSigner.sign.mockRejectedValue(new SigningRejectedError("Wallet rejected the signature."));
  const direct = fixture(directSigner);
  const remote = await harness();
  remote.local.sign.mockRejectedValue(new SigningRejectedError("Wallet rejected the signature."));
  try {
    await expect(direct.sdk.decryption.decryptValues(remote.encryptedInputs)).rejects.toMatchObject(
      { code: "SIGNING_REJECTED", retryable: false },
    );
    const error = await remote.decrypt().catch((error: ServiceError) => error);
    expect((error as ServiceError).metadata.get("zama-error-code")).toEqual(["SIGNING_REJECTED"]);
  } finally {
    direct.sdk.dispose();
    directSigner.dispose();
    await remote.close();
  }
});

test("signerless public decryption preserves proof and values; private decryption fails", async () => {
  const direct = fixture(undefined);
  const remote = await harness(false);
  for (const value of [direct, ...remote.fixtures]) {
    vi.mocked(value.relayer.decryptPublicValuesWithSignatures).mockResolvedValue({
      clearValues: [{ type: "uint256", value: 2n ** 200n }],
      checkSignaturesArgs: {
        handlesList: [VALID_ENCRYPTED_VALUE],
        abiEncodedCleartexts: "0x1234",
        decryptionProof: "0xabcd",
      },
    } as unknown as Awaited<ReturnType<typeof value.relayer.decryptPublicValuesWithSignatures>>);
  }
  try {
    const expected = await direct.sdk.decryption.decryptPublicValues([VALID_ENCRYPTED_VALUE]);
    const actual = await new Promise<{
      values: ClearEntry[];
      abiEncodedClearValues: Buffer;
      decryptionProof: Buffer;
    }>((resolve, reject) =>
      remote.client.decryptPublicValues(
        {
          operation: remote.operation(),
          encryptedValues: [Buffer.from(hexToBytes(VALID_ENCRYPTED_VALUE))],
          timeoutMs: undefined,
        },
        (error, result) => (error ? reject(error) : resolve(result)),
      ),
    );
    expect(decode(actual.values)).toEqual(expected.clearValues);
    expect(bytesToHex(actual.decryptionProof)).toBe(expected.decryptionProof);
    expect(bytesToHex(actual.abiEncodedClearValues)).toBe(expected.abiEncodedClearValues);
    await expect(direct.sdk.decryption.decryptValues(remote.encryptedInputs)).rejects.toMatchObject(
      { code: "SIGNER_NOT_CONFIGURED" },
    );
    await expect(remote.decrypt()).rejects.toMatchObject({
      details: expect.stringContaining("signer"),
    });
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});

test("fresh SDK contexts reuse persisted permits without another wallet signature", async () => {
  const backing = storage();
  const first = await harness(true, backing);
  try {
    await first.decrypt();
    expect(first.local.sign).toHaveBeenCalledTimes(1);
  } finally {
    await first.close();
  }
  const second = await harness(true, backing);
  try {
    await expect(second.decrypt()).resolves.toEqual({ [VALID_ENCRYPTED_VALUE]: 1000n });
    expect(second.local.sign).not.toHaveBeenCalled();
  } finally {
    await second.close();
  }
});

test("SDK revoked-context recovery requests a replacement signature across the channel", async () => {
  const local = new LocalSigner();
  const direct = fixture(local);
  const remote = await harness();
  for (const item of [direct, ...remote.fixtures]) {
    vi.mocked(item.relayer.decryptValues).mockRejectedValueOnce(
      new RevokedKmsContextError("KMS context was revoked."),
    );
  }
  try {
    const expected = await direct.sdk.decryption.decryptValues(remote.encryptedInputs);
    expect(await remote.decrypt()).toEqual(expected);
    expect(local.sign).toHaveBeenCalledTimes(2);
    expect(remote.local.sign).toHaveBeenCalledTimes(2);
  } finally {
    direct.sdk.dispose();
    local.dispose();
    await remote.close();
  }
});

test("offline delegated permits preserve explicit identities, duration defaults and local revocation", async () => {
  const direct = fixture(undefined);
  const remote = await harness(false);
  const delegator = "0x4444444444444444444444444444444444444444";
  try {
    const expected = await direct.sdk.offline.preparePermit({
      signer: USER,
      contracts: [TOKEN],
      delegator,
    });
    const actual = await new Promise<string>((resolve, reject) =>
      remote.client.preparePermit(
        {
          operation: remote.operation(),
          signerAddress: Buffer.from(hexToBytes(USER)),
          contractAddresses: [Buffer.from(hexToBytes(TOKEN))],
          delegatorAddress: Buffer.from(hexToBytes(delegator)),
          durationDays: undefined,
        },
        (error, value) => (error ? reject(error) : resolve(value.preparedPermitJson)),
      ),
    );
    const decoded = JSON.parse(actual);
    expect(decoded.signerAddress).toBe(expected.signerAddress);
    expect(decoded.eip712.message.delegatorAddress).toBe(expected.eip712.message.delegatorAddress);
    expect(decoded.eip712.message.durationDays).toBe(expected.eip712.message.durationDays);
    await direct.sdk.permits.registerPermit(expected, TEST_SIGNATURE);
    await new Promise<void>((resolve, reject) =>
      remote.client.registerPermit(
        {
          operation: remote.operation(),
          preparedPermitJson: actual,
          signature: Buffer.from(hexToBytes(TEST_SIGNATURE)),
        },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    expect(remote.local.sign).not.toHaveBeenCalled();
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});

test("delegated decryption and batch preserve delegator, requester and SDK value semantics", async () => {
  const local = new LocalSigner();
  const direct = fixture(local);
  const remote = await harness();
  const delegator = "0x4444444444444444444444444444444444444444";
  const account = "0x5555555555555555555555555555555555555555";
  for (const item of [direct, ...remote.fixtures]) {
    vi.mocked(item.provider.readContract).mockResolvedValue((1n << 64n) - 1n);
  }
  try {
    const expected = await direct.sdk.decryption.delegatedDecryptValues(
      remote.encryptedInputs,
      delegator,
      account,
      { waitForPropagation: false },
    );
    const request = {
      operation: remote.operation(),
      inputs: remote.inputs,
      delegatorAddress: Buffer.from(hexToBytes(delegator)),
      accountAddress: Buffer.from(hexToBytes(account)),
      waitForPropagation: false,
    };
    const actual = await new Promise<ClearEntry[]>((resolve, reject) =>
      remote.client.delegatedDecryptValues(request, (error, result) =>
        error ? reject(error) : resolve(result.values),
      ),
    );
    expect(decode(actual)).toEqual(expected);
    const batch = await direct.sdk.decryption.delegatedBatchDecryptValues({
      encryptedInputs: remote.encryptedInputs,
      delegatorAddress: delegator,
      accountAddress: account,
      waitForPropagation: false,
      maxConcurrency: 2,
    });
    const actualBatch = await new Promise<DelegatedBatchDecryptValuesResponse>((resolve, reject) =>
      remote.client.delegatedBatchDecryptValues(
        { ...request, operation: remote.operation(), maxConcurrency: 2 },
        (error, result) => (error ? reject(error) : resolve(result)),
      ),
    );
    expect(
      actualBatch.items.map((item) => ({
        encryptedValue: bytesToHex(item.encryptedValue),
        contractAddress: bytesToHex(item.contractAddress).toLowerCase(),
        value: decodeValue(item.value),
      })),
    ).toEqual(
      batch.items.map((item) => ({
        encryptedValue: item.encryptedValue,
        contractAddress: item.contractAddress.toLowerCase(),
        value: item.value,
      })),
    );
    expect(remote.local.sign).toHaveBeenCalledTimes(local.sign.mock.calls.length);
  } finally {
    direct.sdk.dispose();
    local.dispose();
    await remote.close();
  }
});

test.each([
  { type: "uint32", value: 4294967295 },
  { type: "bool", value: false },
  { type: "address", value: USER },
])("public $type values retain their SDK type over protobuf", async (clear) => {
  const direct = fixture(undefined);
  const remote = await harness(false);
  for (const value of [direct, ...remote.fixtures]) {
    vi.mocked(value.relayer.decryptPublicValuesWithSignatures).mockResolvedValue({
      clearValues: [clear],
      checkSignaturesArgs: {
        handlesList: [VALID_ENCRYPTED_VALUE],
        abiEncodedCleartexts: "0x",
        decryptionProof: "0x",
      },
    } as unknown as Awaited<ReturnType<typeof value.relayer.decryptPublicValuesWithSignatures>>);
  }
  try {
    const expected = await direct.sdk.decryption.decryptPublicValues([VALID_ENCRYPTED_VALUE]);
    const actual = await new Promise<ClearEntry[]>((resolve, reject) =>
      remote.client.decryptPublicValues(
        {
          operation: remote.operation(),
          encryptedValues: [Buffer.from(hexToBytes(VALID_ENCRYPTED_VALUE))],
          timeoutMs: undefined,
        },
        (error, result) => (error ? reject(error) : resolve(result.values)),
      ),
    );
    expect(decode(actual)).toEqual(expected.clearValues);
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});

test("expired credentials are renewed by the SDK rather than an example flag", async () => {
  const local = new LocalSigner();
  const direct = fixture(local, storage(), 1);
  const remote = await harness(true, storage(), 1);
  try {
    await direct.sdk.decryption.decryptValues(remote.encryptedInputs);
    await remote.decrypt();
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now + 2 * 86400 * 1000);
    try {
      expect(await direct.sdk.permits.hasPermit([TOKEN])).toBe(false);
      const hasRemote = await new Promise<boolean>((resolve, reject) =>
        remote.client.hasPermit(
          { operation: remote.operation(), contractAddresses: [Buffer.from(hexToBytes(TOKEN))] },
          (error, value) => (error ? reject(error) : resolve(value.hasPermit)),
        ),
      );
      expect(hasRemote).toBe(false);
      const freshHandle = `0x${"03".repeat(32)}` as Hex;
      const expected = await direct.sdk.decryption.decryptValues([
        { encryptedValue: freshHandle, contractAddress: TOKEN },
      ]);
      expect(
        await remote.decrypt([
          {
            encryptedValue: Buffer.from(hexToBytes(freshHandle)),
            contractAddress: Buffer.from(hexToBytes(TOKEN)),
          },
        ]),
      ).toEqual(expected);
      expect(local.sign).toHaveBeenCalledTimes(2);
      expect(remote.local.sign).toHaveBeenCalledTimes(2);
    } finally {
      clock.mockRestore();
    }
  } finally {
    direct.sdk.dispose();
    local.dispose();
    await remote.close();
  }
});

test("revoke distinguishes an empty contract list from omitted and clear resets credentials", async () => {
  const local = new LocalSigner();
  const direct = fixture(local);
  const remote = await harness();
  const has = () =>
    new Promise<boolean>((resolve, reject) =>
      remote.client.hasPermit(
        { operation: remote.operation(), contractAddresses: [Buffer.from(hexToBytes(TOKEN))] },
        (error, value) => (error ? reject(error) : resolve(value.hasPermit)),
      ),
    );
  try {
    await direct.sdk.permits.grantPermit([TOKEN]);
    await remote.decrypt();
    await direct.sdk.permits.revokePermits([]);
    await new Promise<void>((resolve, reject) =>
      remote.client.revokePermits(
        { operation: remote.operation(), contracts: { addresses: [] } },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    expect(await has()).toBe(await direct.sdk.permits.hasPermit([TOKEN]));
    expect(await has()).toBe(true);
    await direct.sdk.permits.revokePermits();
    await new Promise<void>((resolve, reject) =>
      remote.client.revokePermits(
        { operation: remote.operation(), contracts: undefined },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    expect(await has()).toBe(await direct.sdk.permits.hasPermit([TOKEN]));
    expect(await has()).toBe(false);
    await remote.decrypt();
    expect(remote.local.sign).toHaveBeenCalledTimes(2);
    await new Promise<void>((resolve, reject) =>
      remote.client.clearPermits({ operation: remote.operation() }, (error) =>
        error ? reject(error) : resolve(),
      ),
    );
    expect(await has()).toBe(false);
  } finally {
    direct.sdk.dispose();
    local.dispose();
    await remote.close();
  }
});

function delegatedBatch(
  remote: Awaited<ReturnType<typeof harness>>,
  encryptedInputs: { encryptedValue: Hex; contractAddress: Hex }[],
) {
  return new Promise<DelegatedBatchDecryptValuesResponse>((resolve, reject) =>
    remote.client.delegatedBatchDecryptValues(
      {
        operation: remote.operation(),
        inputs: encryptedInputs.map((input) => ({
          encryptedValue: Buffer.from(hexToBytes(input.encryptedValue)),
          contractAddress: Buffer.from(hexToBytes(input.contractAddress)),
        })),
        delegatorAddress: Buffer.from(hexToBytes("0x4444444444444444444444444444444444444444")),
        accountAddress: undefined,
        waitForPropagation: false,
        maxConcurrency: 1,
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
}

test("delegated batch fallback preserves per-item success and failure", async () => {
  const signer = new LocalSigner();
  const direct = fixture(signer);
  const remote = await harness();
  const badHandle = `0x${"02".repeat(32)}` as Hex;
  const encryptedInputs = [
    ...remote.encryptedInputs,
    { encryptedValue: badHandle, contractAddress: TOKEN },
  ];
  for (const value of [direct, ...remote.fixtures]) {
    vi.mocked(value.provider.readContract).mockResolvedValue((1n << 64n) - 1n);
    const decrypt = vi.mocked(value.relayer.decryptValues).getMockImplementation();
    if (!decrypt) {
      throw new Error("Missing fixture decryption implementation.");
    }
    vi.mocked(value.relayer.decryptValues).mockImplementation(async (parameters) => {
      const { encryptedValues } = parameters;
      if (encryptedValues.length > 1 || encryptedValues.includes(badHandle)) {
        throw new DecryptionFailedError("Fixture ciphertext cannot decrypt.");
      }
      return decrypt(parameters);
    });
  }
  try {
    const expected = await direct.sdk.decryption.delegatedBatchDecryptValues({
      encryptedInputs,
      delegatorAddress: "0x4444444444444444444444444444444444444444",
      waitForPropagation: false,
      maxConcurrency: 1,
    });
    const actual = await delegatedBatch(remote, encryptedInputs);
    expect(
      actual.items.map((item) => ({
        encryptedValue: bytesToHex(item.encryptedValue),
        value: decode([{ encryptedValue: item.encryptedValue, value: item.value }])[
          bytesToHex(item.encryptedValue)
        ],
        error: item.error?.code,
      })),
    ).toEqual(
      expected.items.map((item) => ({
        encryptedValue: item.encryptedValue,
        value: item.value,
        error: item.error?.code,
      })),
    );
    expect(expected.items[0]?.value).toBe(1000n);
    expect(expected.items[1]?.error?.code).toBe("DECRYPTION_FAILED");
    expect(direct.relayer.decryptValues).toHaveBeenCalledTimes(3);
    expect(remote.fixtures[0]?.relayer.decryptValues).toHaveBeenCalledTimes(3);
  } finally {
    direct.sdk.dispose();
    signer.dispose();
    await remote.close();
  }
});

test("fatal signer rate limits preserve SDK code and retry delay without batch fallback", async () => {
  const signer = new LocalSigner();
  const direct = fixture(signer);
  const remote = await harness();
  signer.sign.mockRejectedValue(
    new RpcRateLimitError("Wallet RPC throttled.", { retryAfter: 1.25 }),
  );
  remote.local.sign.mockRejectedValue(
    new RpcRateLimitError("Wallet RPC throttled.", { retryAfter: 1.25 }),
  );
  const encryptedInputs = [
    ...remote.encryptedInputs,
    { encryptedValue: `0x${"02".repeat(32)}` as Hex, contractAddress: TOKEN },
  ];
  for (const value of [direct, ...remote.fixtures]) {
    vi.mocked(value.provider.readContract).mockResolvedValue((1n << 64n) - 1n);
  }
  try {
    const expected = await direct.sdk.decryption
      .delegatedBatchDecryptValues({
        encryptedInputs,
        delegatorAddress: "0x4444444444444444444444444444444444444444",
        waitForPropagation: false,
        maxConcurrency: 1,
      })
      .catch((error: RpcRateLimitError) => error);
    expect(expected).toMatchObject({ code: "RPC_RATE_LIMITED", retryable: true, retryAfter: 1.25 });
    const actual = await delegatedBatch(remote, encryptedInputs).catch(
      (error: ServiceError) => error,
    );
    const error = actual as ServiceError;
    expect(error.metadata.get("zama-error-code")).toEqual(["RPC_RATE_LIMITED"]);
    expect(error.metadata.get("zama-error-retryable")).toEqual(["true"]);
    expect(error.metadata.get("zama-error-retry-after-seconds")).toEqual(["1.25"]);
    expect(signer.sign).toHaveBeenCalledTimes(1);
    expect(remote.local.sign).toHaveBeenCalledTimes(1);
    expect(direct.relayer.decryptValues).not.toHaveBeenCalled();
    expect(remote.fixtures[0]?.relayer.decryptValues).not.toHaveBeenCalled();
  } finally {
    direct.sdk.dispose();
    signer.dispose();
    await remote.close();
  }
});
