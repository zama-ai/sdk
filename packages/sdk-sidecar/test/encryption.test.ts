import { randomUUID } from "node:crypto";
import { Metadata, status, type ServiceError } from "@grpc/grpc-js";
import type { EncryptInput, EncryptParams, EncryptResult } from "@zama-fhe/sdk";
import { bytesToHex, getAddress } from "viem";
import { expect, test, vi } from "vitest";
import { bytes } from "../src/encoding.js";
import { serviceError } from "../src/errors.js";
import { encrypt as adaptEncryption, encryptInput } from "../src/encryption.js";
import type {
  EncryptInput as WireInput,
  EncryptRequest,
  EncryptResponse,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import type { ContextSdk } from "../src/runtime.js";
import { encryptionFixture, encryptionServer } from "./support/encryption.js";

const contractAddress = getAddress("0x1234567890123456789012345678901234567890");
const userAddress = getAddress("0xabcdefabcdefabcdefabcdefabcdefabcdefabcd");
const inputs: EncryptInput[] = [
  ...([8, 16, 32, 64, 128, 256] as const).map((bits): EncryptInput => ({
    type: `euint${bits}`,
    value: (1n << BigInt(bits)) - 1n,
  })),
  { type: "ebool", value: false },
  { type: "ebool", value: true },
  { type: "ebool", value: 0n },
  { type: "ebool", value: 1n },
  { type: "eaddress", value: userAddress },
];
function wire(value: EncryptInput): WireInput {
  return {
    type: value.type,
    value:
      typeof value.value === "bigint"
        ? { $case: "bigintValue", bigintValue: value.value.toString() }
        : typeof value.value === "boolean"
          ? { $case: "boolValue", boolValue: value.value }
          : { $case: "addressValue", addressValue: bytes(value.value) },
  };
}
async function harness(signerEnabled = false) {
  const server = await encryptionServer();
  const contextId = await new Promise<string>((resolve, reject) =>
    server.client.createContext(
      {
        config: undefined,
        transportKeyPairDerivationSecret: undefined,
        signerEnabled,
        account: signerEnabled ? { address: bytes(contractAddress), chainId: 31337n } : undefined,
        storage: undefined,
        permitStorage: undefined,
      },
      (error, response) => (error ? reject(error) : resolve(response.contextId)),
    ),
  );
  const request = (values = inputs, timeoutMs?: number): EncryptRequest => ({
    operation: { contextId, operationId: randomUUID() },
    values: values.map(wire),
    contractAddress: bytes(contractAddress),
    userAddress: bytes(userAddress),
    timeoutMs,
  });
  const encrypt = (value = request()) =>
    new Promise<EncryptResponse>((resolve, reject) =>
      server.client.encrypt(value, (error, response) =>
        error ? reject(error) : resolve(response),
      ),
    );
  return { ...server, request, encrypt };
}
function proof(result: EncryptResult) {
  return JSON.parse(Buffer.from(result.inputProof.slice(2), "hex").toString());
}
function decode(result: EncryptResponse): EncryptResult {
  return {
    encryptedValues: result.encryptedValues.map((value) => bytesToHex(value)),
    inputProof: bytesToHex(result.inputProof),
  };
}

test.each([undefined, 0, 1234, 0xffff_ffff])(
  "direct SDK and wire preserve all types, binding, and timeout %s",
  async (timeout) => {
    const direct = encryptionFixture(undefined);
    const remote = await harness();
    try {
      const params: EncryptParams = { values: inputs, contractAddress, userAddress };
      const options = timeout === undefined ? undefined : { timeout };
      const local = await direct.sdk.encrypt(params, options);
      const result = decode(await remote.encrypt(remote.request(inputs, timeout)));
      expect(proof(result)).toEqual(proof(local));
      expect(result.encryptedValues).toHaveLength(inputs.length);
      expect(result.encryptedValues.every((value) => /^0x[0-9a-f]{64}$/.test(value))).toBe(true);
      expect(result.encryptedValues).not.toEqual(local.encryptedValues);
      const received = remote.fixtures[0]!.encryptValues.mock.calls[0]![0];
      expect(received.values).toEqual(inputs);
      expect(received.options).toHaveProperty("signal");
      expect(Object.hasOwn(received.options!, "timeout")).toBe(timeout !== undefined);
    } finally {
      direct.sdk.dispose();
      await remote.close();
    }
  },
);

test.each([-1, 1.5, 0x1_0000_0000])(
  "the direct adapter rejects invalid timeout %s before calling the SDK",
  async (timeoutMs) => {
    const sdk = { encrypt: vi.fn() } as unknown as ContextSdk;
    await expect(
      adaptEncryption(
        sdk,
        {
          operation: undefined,
          values: inputs.map(wire),
          contractAddress: bytes(contractAddress),
          userAddress: bytes(userAddress),
          timeoutMs,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
      message: "Timeout must be an unsigned 32-bit integer.",
    });
    expect(sdk.encrypt).not.toHaveBeenCalled();
  },
);

test("empty inputs and out-of-range integers reach SDK unchanged", async () => {
  const remote = await harness();
  try {
    for (const values of [
      [],
      [
        { type: "euint8", value: -1n },
        { type: "euint8", value: 256n },
      ] satisfies EncryptInput[],
    ]) {
      const result = await remote.encrypt(remote.request(values));
      expect(result.encryptedValues).toHaveLength(values.length);
      expect(remote.fixtures[0]!.encryptValues.mock.lastCall![0].values).toEqual(values);
    }
  } finally {
    await remote.close();
  }
});

test.each([
  { timeout: 13, details: "Encryption service busy", retryable: ["true"], retryAfter: ["7"] },
  {
    timeout: 16,
    details: "Encryption retry hint is fractional",
    retryable: ["true"],
    retryAfter: [],
  },
  { timeout: 17, details: "Encryption service unavailable", retryable: ["false"], retryAfter: [] },
])(
  "SDK failure preserves only valid whole-second retry details for timeout $timeout",
  async ({ timeout, details, retryable, retryAfter }) => {
    const direct = encryptionFixture(undefined);
    const remote = await harness();
    try {
      const expected = await direct.sdk
        .encrypt({ values: inputs, contractAddress, userAddress }, { timeout })
        .catch(serviceError);
      const actual = await remote
        .encrypt(remote.request(inputs, timeout))
        .catch((error: ServiceError) => error);
      expect(actual).toMatchObject({ code: (expected as ServiceError).code, details });
      for (const key of [
        "zama-error-code",
        "zama-error-retryable",
        "zama-error-retry-after-seconds",
      ]) {
        expect((actual as ServiceError).metadata.get(key)).toEqual(
          (expected as ServiceError).metadata.get(key),
        );
      }
      expect((actual as ServiceError).metadata.get("zama-error-retryable")).toEqual(retryable);
      expect((actual as ServiceError).metadata.get("zama-error-retry-after-seconds")).toEqual(
        retryAfter,
      );
    } finally {
      direct.sdk.dispose();
      await remote.close();
    }
  },
);

test("concurrent public encryption and cancellation remain isolated", async () => {
  const remote = await harness(true);
  try {
    const start = () => {
      let call: ReturnType<typeof remote.client.encrypt>;
      const result = new Promise<ServiceError>((resolve, reject) => {
        call = remote.client.encrypt(remote.request(inputs, 14), (error) => {
          if (error) {
            resolve(error);
          } else {
            reject(new Error("blocked encryption unexpectedly completed"));
          }
        });
      });
      return { call: call!, result };
    };
    const first = start();
    const second = start();
    await expect.poll(() => remote.fixtures[0]!.encryptValues.mock.calls.length).toBe(2);
    const firstSignal = remote.fixtures[0]!.encryptValues.mock.calls[0]![0].options!.signal!;
    const secondSignal = remote.fixtures[0]!.encryptValues.mock.calls[1]![0].options!.signal!;

    first.call.cancel();
    expect(await first.result).toMatchObject({ code: status.CANCELLED });
    await expect.poll(() => firstSignal.aborted).toBe(true);
    expect(secondSignal.aborted).toBe(false);

    second.call.cancel();
    expect(await second.result).toMatchObject({ code: status.CANCELLED });
    await expect.poll(() => secondSignal.aborted).toBe(true);
  } finally {
    await remote.close();
  }
});

test.each(["cancel", "deadline", "close"])("%s aborts SDK encryption", async (mode) => {
  const remote = await harness();
  try {
    const request = remote.request(inputs, 14);
    let call: ReturnType<typeof remote.client.encrypt>;
    const result = new Promise<EncryptResponse>((resolve, reject) => {
      call = remote.client.encrypt(
        request,
        new Metadata(),
        mode === "deadline" ? { deadline: Date.now() + 100 } : {},
        (error, response) => (error ? reject(error) : resolve(response)),
      );
    });
    const failed = result.catch((error: ServiceError) => error);
    await expect.poll(() => remote.fixtures[0]!.encryptValues.mock.calls.length).toBe(1);
    const signal = remote.fixtures[0]!.encryptValues.mock.calls[0]![0].options!.signal!;
    if (mode === "cancel") {
      call!.cancel();
    }
    if (mode === "close") {
      await new Promise<void>((resolve, reject) =>
        remote.client.closeContext({ contextId: request.operation!.contextId }, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
    }
    expect(await failed).toMatchObject({
      code: mode === "deadline" ? status.DEADLINE_EXCEEDED : status.CANCELLED,
    });
    await expect.poll(() => signal.aborted).toBe(true);
  } finally {
    await remote.close();
  }
});

test.each(["", "01", "-0", "1.5", "0x10", "+1", " 1"])(
  "rejects malformed decimal %j at the wire boundary",
  (bigintValue) => {
    expect(() =>
      encryptInput({ type: "euint64", value: { $case: "bigintValue", bigintValue } }),
    ).toThrow("canonical decimal");
  },
);
test("rejects missing values, unsupported types and invalid address lengths", async () => {
  for (const input of [
    { type: "ebool", value: undefined },
    { type: "euint160", value: { $case: "bigintValue", bigintValue: "1" } },
    { type: "euint8", value: { $case: "boolValue", boolValue: true } },
  ] satisfies WireInput[]) {
    expect(() => encryptInput(input)).toThrow("type and value");
  }
  const remote = await harness();
  try {
    await expect(
      remote.encrypt({ ...remote.request(), userAddress: Buffer.alloc(19) }),
    ).rejects.toMatchObject({ code: status.INVALID_ARGUMENT });
    expect(remote.fixtures[0]!.relayer.encryptValues).not.toHaveBeenCalled();
  } finally {
    await remote.close();
  }
});

test("canonical backend numeric rejection errors match direct SDK errors", async () => {
  const { createEncryptionValidationBackend } =
    await import("../../sdk/src/test-fixtures/encryption.js");
  const validate = createEncryptionValidationBackend();
  const direct = encryptionFixture(undefined);
  const remote = await harness();
  direct.encryptValues.mockImplementation(validate);
  remote.fixtures[0]!.encryptValues.mockImplementation(validate);
  try {
    for (const values of [
      [{ type: "euint8", value: -1n }],
      [{ type: "euint8", value: 256n }],
      [{ type: "euint256", value: 1n << 256n }],
      [{ type: "ebool", value: 2n }],
    ] as EncryptInput[][]) {
      const params = { values, contractAddress, userAddress };
      const backendError = await validate(params).catch((error: Error) => error);
      expect(backendError).toBeInstanceOf(Error);
      expect((backendError as Error).message).not.toContain("network access");
      const local = await direct.sdk.encrypt(params).catch(serviceError);
      const result = await remote
        .encrypt(remote.request(values))
        .catch((error: ServiceError) => error);
      expect(result).toMatchObject({
        code: (local as ServiceError).code,
        details: (local as ServiceError).details,
      });
      expect((result as ServiceError).metadata.get("zama-error-code")).toEqual([
        "ENCRYPTION_FAILED",
      ]);
      expect((result as ServiceError).metadata.get("zama-error-retryable")).toEqual(["false"]);
    }
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});

test("explicit user binding stays independent from the connected wallet", async () => {
  const remote = await harness(true);
  try {
    const result = decode(await remote.encrypt());
    expect(proof(result).userAddress).toBe(userAddress);
    const changed = await remote.encrypt({
      ...remote.request(),
      contractAddress: bytes(userAddress),
      userAddress: bytes(contractAddress),
    });
    expect(proof(decode(changed))).toMatchObject({
      contractAddress: userAddress,
      userAddress: contractAddress,
    });
  } finally {
    await remote.close();
  }
});

test("a direct SDK call observes the same abort signal behavior", async () => {
  const direct = encryptionFixture(undefined);
  const controller = new AbortController();
  try {
    const result = direct.sdk.encrypt(
      { values: inputs, contractAddress, userAddress },
      { timeout: 14, signal: controller.signal },
    );
    const failed = result.catch((error: Error) => error);
    await expect.poll(() => direct.encryptValues.mock.calls.length).toBe(1);
    controller.abort();
    expect(await failed).toMatchObject({ code: "ENCRYPTION_FAILED" });
    expect(direct.encryptValues.mock.lastCall![0].options!.signal!.aborted).toBe(true);
  } finally {
    direct.sdk.dispose();
  }
});
