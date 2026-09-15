import { randomUUID } from "node:crypto";
import { status, type ServiceError } from "@grpc/grpc-js";
import { RpcRateLimitError, type PrepareTransactionRequest } from "@zama-fhe/sdk";
import { expect, test, vi } from "vitest";
import { USER, TOKEN, DELEGATE } from "../../sdk/src/test-fixtures/constants.js";
import { bytes } from "../src/encoding.js";
import { errorDetails } from "../src/errors.js";
import { prepareTransaction } from "../src/offline.js";
import type * as rpc from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { fixture, testServer } from "./support/harness.js";

const from = bytes(USER);
const base = { from, operation: undefined, options: undefined };
const setOperator: rpc.PrepareTransactionRequest = {
  ...base,
  transaction: {
    $case: "setOperator",
    setOperator: { token: bytes(TOKEN), operator: bytes(DELEGATE), until: 1n },
  },
};

async function compare(request: PrepareTransactionRequest, wire: rpc.PrepareTransactionRequest) {
  const direct = fixture(undefined);
  const remote = fixture(undefined);
  const outcome = async (run: () => Promise<unknown>) => {
    try {
      return { result: await run() };
    } catch (error) {
      return { error: errorDetails(error) };
    }
  };
  try {
    const expected = await outcome(() => direct.sdk.offline.prepare(request));
    const actual = await outcome(() => prepareTransaction(remote.sdk, wire));
    return [
      { error: actual.error, calls: vi.mocked(remote.provider.prepareTransaction).mock.calls },
      { error: expected.error, calls: vi.mocked(direct.provider.prepareTransaction).mock.calls },
    ];
  } finally {
    direct.sdk.dispose();
    remote.sdk.dispose();
  }
}

test.each([undefined, 0n, BigInt(Date.UTC(2099, 0, 1)) + 123n, 8_640_000_000_000_001n])(
  "delegation expiry %s retains SDK defaults and validation",
  async (milliseconds) => {
    const [actual, expected] = await compare(
      {
        kind: "DelegateDecryption",
        from: USER,
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
        ...(milliseconds === undefined ? {} : { expirationDate: new Date(Number(milliseconds)) }),
      },
      {
        ...base,
        transaction: {
          $case: "delegateDecryption",
          delegateDecryption: {
            contractAddress: bytes(TOKEN),
            delegateAddress: bytes(DELEGATE),
            expirationDateMs: milliseconds,
          },
        },
      },
    );
    expect(actual).toEqual(expected);
  },
);

test.each([
  ["operator expiry", { ...setOperator }],
  [
    "delegation expiry",
    {
      ...base,
      transaction: {
        $case: "delegateDecryption" as const,
        delegateDecryption: {
          contractAddress: bytes(TOKEN),
          delegateAddress: bytes(DELEGATE),
          expirationDateMs: 2n ** 53n,
        },
      },
    },
  ],
])("rejects %s beyond the SDK safe integer range", async (_, request) => {
  const value = fixture(undefined);
  const wire: rpc.PrepareTransactionRequest =
    request.transaction?.$case === "setOperator"
      ? {
          ...request,
          transaction: {
            $case: "setOperator",
            setOperator: { ...request.transaction.setOperator, until: 2n ** 53n },
          },
        }
      : request;
  try {
    await expect(prepareTransaction(value.sdk, wire)).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
    expect(value.provider.prepareTransaction).not.toHaveBeenCalled();
  } finally {
    value.sdk.dispose();
  }
});

test.each([undefined, Buffer.alloc(0), bytes(DELEGATE), Buffer.from([1])])(
  "recipient data %s retains SDK defaults and validation",
  async (recipientData) => {
    const [actual, expected] = await compare(
      {
        kind: "TransferAndCall",
        from: USER,
        underlying: TOKEN,
        wrapper: DELEGATE,
        amount: 2n ** 100n,
        ...(recipientData === undefined
          ? {}
          : { recipientData: `0x${recipientData.toString("hex")}` }),
      },
      {
        ...base,
        transaction: {
          $case: "transferAndCall",
          transferAndCall: {
            underlying: bytes(TOKEN),
            wrapper: bytes(DELEGATE),
            amount: (2n ** 100n).toString(),
            recipientData,
          },
        },
      },
    );
    expect(actual).toEqual(expected);
  },
);

test.each(["", " 1", "01", "1.2", "0x01", "+1", "-0"])(
  "rejects malformed wire decimal %s",
  async (amount) => {
    const value = fixture(undefined);
    try {
      await expect(
        prepareTransaction(value.sdk, {
          ...base,
          transaction: { $case: "wrap", wrap: { wrapper: bytes(TOKEN), to: bytes(USER), amount } },
        }),
      ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
      expect(value.provider.prepareTransaction).not.toHaveBeenCalled();
    } finally {
      value.sdk.dispose();
    }
  },
);

test("missing transaction fails at the transport boundary", async () => {
  const value = fixture(undefined);
  try {
    await expect(
      prepareTransaction(value.sdk, { ...base, transaction: undefined }),
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  } finally {
    value.sdk.dispose();
  }
});

test("offline cancellation drains uninterruptible SDK work before context close", async () => {
  const value = fixture(undefined);
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<`0x${string}`>();
  vi.mocked(value.provider.prepareTransaction).mockImplementation(() => {
    entered.resolve();
    return release.promise;
  });
  const server = await testServer(async () => ({ sdk: value.sdk, storageIdentities: [] }));
  try {
    const contextId = await new Promise<string>((resolve, reject) =>
      server.client.createContext(
        {
          config: undefined,
          signerEnabled: false,
          account: undefined,
          storage: undefined,
          permitStorage: undefined,
          transportKeyPairDerivationSecret: undefined,
        },
        (error, result) => (error ? reject(error) : resolve(result.contextId)),
      ),
    );
    const result = Promise.withResolvers<ServiceError | null>();
    const call = server.client.prepareTransaction(
      { ...setOperator, operation: { contextId, operationId: randomUUID() } },
      (error) => result.resolve(error),
    );
    await entered.promise;
    call.cancel();
    expect((await result.promise)?.code).toBe(status.CANCELLED);
    let closed = false;
    const closing = new Promise<void>((resolve, reject) =>
      server.client.closeContext({ contextId }, (error) => (error ? reject(error) : resolve())),
    ).then(() => {
      closed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(closed).toBe(false);
    release.resolve("0x02c0");
    await closing;
    expect(value.provider.prepareTransaction).toHaveBeenCalledTimes(1);
  } finally {
    release.resolve("0x02c0");
    await server.close();
  }
});

test("offline preparation preserves structured provider errors", async () => {
  const value = fixture(undefined);
  const failure = new RpcRateLimitError("fixture rate limit", { retryAfter: 7 });
  vi.mocked(value.provider.prepareTransaction).mockRejectedValue(failure);
  try {
    await expect(prepareTransaction(value.sdk, setOperator)).rejects.toBe(failure);
  } finally {
    value.sdk.dispose();
  }
});
