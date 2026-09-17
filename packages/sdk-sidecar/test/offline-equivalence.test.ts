import { Metadata, status, type ServiceError } from "@grpc/grpc-js";
import { randomUUID } from "node:crypto";
import type { Hex, PrepareTransactionRequest } from "@zama-fhe/sdk";
import { bytesToHex, hexToBytes } from "viem";
import { expect, test, vi } from "vitest";

import { ACL, DELEGATE, TOKEN, USER, WRAPPER } from "../../sdk/src/test-fixtures/constants.js";
import { fixture, storage, testServer } from "./support/harness.js";
import type * as rpc from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { TransactionKind } from "../src/generated/zama/sdk/v1alpha1/sidecar.js";

type Case = {
  name: string;
  wireKind: rpc.TransactionKind;
  request: PrepareTransactionRequest;
  transaction: NonNullable<rpc.PrepareTransactionRequest["transaction"]>;
};

const wireBytes = (value: string) => Buffer.from(hexToBytes(value as Hex));
const from = wireBytes(USER);
const farFuture = new Date("2099-01-01T00:00:00.000Z");

const cases: Case[] = [
  {
    name: "ConfidentialTransfer",
    wireKind: TransactionKind.TRANSACTION_KIND_CONFIDENTIAL_TRANSFER,
    request: { kind: "ConfidentialTransfer", from: USER, token: TOKEN, to: ACL, amount: 7n },
    transaction: {
      $case: "confidentialTransfer",
      confidentialTransfer: { token: wireBytes(TOKEN), to: wireBytes(ACL), amount: "7" },
    },
  },
  {
    name: "ConfidentialTransferFrom",
    wireKind: TransactionKind.TRANSACTION_KIND_CONFIDENTIAL_TRANSFER_FROM,
    request: {
      kind: "ConfidentialTransferFrom",
      from: USER,
      token: TOKEN,
      owner: ACL,
      to: DELEGATE,
      amount: 8n,
    },
    transaction: {
      $case: "confidentialTransferFrom",
      confidentialTransferFrom: {
        token: wireBytes(TOKEN),
        owner: wireBytes(ACL),
        to: wireBytes(DELEGATE),
        amount: "8",
      },
    },
  },
  {
    name: "SetOperator",
    wireKind: TransactionKind.TRANSACTION_KIND_SET_OPERATOR,
    request: { kind: "SetOperator", from: USER, token: TOKEN, operator: DELEGATE, until: 123 },
    transaction: {
      $case: "setOperator",
      setOperator: { token: wireBytes(TOKEN), operator: wireBytes(DELEGATE), until: 123n },
    },
  },
  {
    name: "Unwrap",
    wireKind: TransactionKind.TRANSACTION_KIND_UNWRAP,
    request: { kind: "Unwrap", from: USER, token: WRAPPER, to: ACL, amount: 9n },
    transaction: {
      $case: "unwrap",
      unwrap: { token: wireBytes(WRAPPER), to: wireBytes(ACL), amount: "9" },
    },
  },
  {
    name: "UnwrapAll",
    wireKind: TransactionKind.TRANSACTION_KIND_UNWRAP_ALL,
    request: { kind: "UnwrapAll", from: USER, token: WRAPPER, to: ACL },
    transaction: {
      $case: "unwrapAll",
      unwrapAll: { token: wireBytes(WRAPPER), to: wireBytes(ACL) },
    },
  },
  {
    name: "FinalizeUnwrap",
    wireKind: TransactionKind.TRANSACTION_KIND_FINALIZE_UNWRAP,
    request: {
      kind: "FinalizeUnwrap",
      from: USER,
      wrapper: WRAPPER,
      unwrapRequestIdOrAmount: ("0x" + "12".repeat(32)) as Hex,
    },
    transaction: {
      $case: "finalizeUnwrap",
      finalizeUnwrap: {
        wrapper: wireBytes(WRAPPER),
        unwrapRequestIdOrAmount: wireBytes("0x" + "12".repeat(32)),
      },
    },
  },
  {
    name: "ApproveUnderlying",
    wireKind: TransactionKind.TRANSACTION_KIND_APPROVE_UNDERLYING,
    request: {
      kind: "ApproveUnderlying",
      from: USER,
      underlying: TOKEN,
      spender: WRAPPER,
      amount: 10n,
    },
    transaction: {
      $case: "approveUnderlying",
      approveUnderlying: {
        underlying: wireBytes(TOKEN),
        spender: wireBytes(WRAPPER),
        amount: "10",
      },
    },
  },
  {
    name: "Wrap",
    wireKind: TransactionKind.TRANSACTION_KIND_WRAP,
    request: { kind: "Wrap", from: USER, wrapper: WRAPPER, to: ACL, amount: 11n },
    transaction: {
      $case: "wrap",
      wrap: { wrapper: wireBytes(WRAPPER), to: wireBytes(ACL), amount: "11" },
    },
  },
  {
    name: "TransferAndCall",
    wireKind: TransactionKind.TRANSACTION_KIND_TRANSFER_AND_CALL,
    request: {
      kind: "TransferAndCall",
      from: USER,
      underlying: TOKEN,
      wrapper: WRAPPER,
      amount: 12n,
      recipientData: ("0x" + "34".repeat(20)) as Hex,
    },
    transaction: {
      $case: "transferAndCall",
      transferAndCall: {
        underlying: wireBytes(TOKEN),
        wrapper: wireBytes(WRAPPER),
        amount: "12",
        recipientData: wireBytes("0x" + "34".repeat(20)),
      },
    },
  },
  {
    name: "DelegateDecryption",
    wireKind: TransactionKind.TRANSACTION_KIND_DELEGATE_DECRYPTION,
    request: {
      kind: "DelegateDecryption",
      from: USER,
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
      expirationDate: farFuture,
    },
    transaction: {
      $case: "delegateDecryption",
      delegateDecryption: {
        contractAddress: wireBytes(TOKEN),
        delegateAddress: wireBytes(DELEGATE),
        expirationDateMs: BigInt(farFuture.getTime()),
      },
    },
  },
  {
    name: "RevokeDelegation",
    wireKind: TransactionKind.TRANSACTION_KIND_REVOKE_DELEGATION,
    request: {
      kind: "RevokeDelegation",
      from: USER,
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
    },
    transaction: {
      $case: "revokeDelegation",
      revokeDelegation: { contractAddress: wireBytes(TOKEN), delegateAddress: wireBytes(DELEGATE) },
    },
  },
];

const options: rpc.PrepareOptions = {
  nonce: 0n,
  gasLimit: "0",
  fees: { maxFeePerGas: "0", maxPriorityFeePerGas: "0" },
};

async function harness(signerEnabled = false) {
  const fixtures: ReturnType<typeof fixture>[] = [];
  const server = await testServer(async (_, signer) => {
    const value = fixture(signer, storage());
    fixtures.push(value);
    return { sdk: value.sdk, storageIdentities: ["offline-equivalence"] };
  });
  const { client } = server;
  const contextId = await new Promise<string>((resolve, reject) =>
    client.createContext(
      {
        config: undefined,
        signerEnabled,
        account: undefined,
        storage: undefined,
        permitStorage: undefined,
        transportKeyPairDerivationSecret: undefined,
      },
      (error, value) => (error ? reject(error) : resolve(value.contextId)),
    ),
  );
  return {
    client,
    fixtures,
    operation: () => ({ contextId, operationId: randomUUID() }),
    close: server.close,
  };
}

async function prepare(
  remote: Awaited<ReturnType<typeof harness>>,
  item: Case,
  explicitOptions = true,
  transaction = item.transaction,
  optionsValue: rpc.PrepareOptions = options,
) {
  return new Promise<rpc.PrepareTransactionResponse>((resolve, reject) =>
    remote.client.prepareTransaction(
      {
        operation: remote.operation(),
        from,
        options: explicitOptions ? optionsValue : undefined,
        transaction,
      },
      new Metadata(),
      (error, value) => (error ? reject(error) : resolve(value)),
    ),
  );
}

function errorCode(error: unknown): string | undefined {
  const metadata = (error as ServiceError).metadata;
  const sdkCode = metadata?.get("zama-error-code")[0]?.toString();
  if (sdkCode) {
    return sdkCode;
  }
  if (typeof error === "object" && error !== null && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

test.each(cases)("offline prepare equivalence: $name", async (item) => {
  const direct = fixture(undefined);
  const remote = await harness(false);
  try {
    if (item.name === "UnwrapAll") {
      vi.mocked(direct.provider.readContract).mockResolvedValue(("0x" + "ab".repeat(32)) as never);
      vi.mocked(remote.fixtures[0]!.provider.readContract).mockResolvedValue(
        ("0x" + "ab".repeat(32)) as never,
      );
    }
    if (item.name === "FinalizeUnwrap") {
      const result = {
        clearValues: [{ type: "uint64", value: 13n }],
        checkSignaturesArgs: {
          handlesList: ["0x" + "12".repeat(32)],
          abiEncodedCleartexts: "0x0d",
          decryptionProof: "0xabcd",
        },
      } as never;
      vi.mocked(direct.relayer.decryptPublicValuesWithSignatures).mockResolvedValue(result);
      vi.mocked(remote.fixtures[0]!.relayer.decryptPublicValuesWithSignatures).mockResolvedValue(
        result,
      );
    }
    const expected = await direct.sdk.offline.prepare(item.request, {
      nonce: 0,
      gasLimit: 0n,
      fees: { maxFeePerGas: 0n, maxPriorityFeePerGas: 0n },
    });
    const actual = await prepare(remote, item);
    expect([expected.kind, actual.kind]).toEqual([item.request.kind, item.wireKind]);
    expect(bytesToHex(actual.from)).toBe(expected.from.toLowerCase());
    expect(bytesToHex(actual.unsignedTx)).toBe(expected.unsignedTx);
    expect(remote.fixtures[0]?.provider.prepareTransaction).toHaveBeenCalledTimes(1);
    expect(direct.provider.prepareTransaction).toHaveBeenCalledTimes(1);
    expect(remote.fixtures[0]?.provider.prepareTransaction).toHaveBeenCalledWith(
      vi.mocked(direct.provider.prepareTransaction).mock.calls[0]?.[0],
    );
    expect(vi.mocked(remote.fixtures[0]!.relayer.encryptValues).mock.calls).toEqual(
      vi.mocked(direct.relayer.encryptValues).mock.calls,
    );
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});

test.each(cases)("offline prepare preserves omitted options: $name", async (item) => {
  const direct = fixture(undefined);
  const remote = await harness(false);
  try {
    const expected = await direct.sdk.offline.prepare(item.request);
    const actual = await prepare(remote, item, false);
    expect({
      kind: actual.kind,
      from: bytesToHex(actual.from),
      unsignedTx: bytesToHex(actual.unsignedTx),
    }).toEqual({
      kind: item.wireKind,
      from: expected.from.toLowerCase(),
      unsignedTx: expected.unsignedTx,
    });
    expect(expected.kind).toBe(item.request.kind);
    expect(remote.fixtures[0]?.provider.prepareTransaction).toHaveBeenCalledWith(
      vi.mocked(direct.provider.prepareTransaction).mock.calls[0]?.[0],
    );
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});

test("offline prepare rejects a nonce beyond the SDK safe integer range", async () => {
  const remote = await harness(false);
  try {
    const error = await prepare(remote, cases[0]!, true, cases[0]!.transaction, {
      nonce: 2n ** 53n,
      gasLimit: undefined,
      fees: undefined,
    }).catch((error) => error);
    expect(errorCode(error)).toBe("INVALID_ARGUMENT");
    expect((error as ServiceError).code).toBe(status.INVALID_ARGUMENT);
    expect(remote.fixtures[0]?.provider.prepareTransaction).not.toHaveBeenCalled();
  } finally {
    await remote.close();
  }
});

test("offline prepare rejects SDK-invalid recipient data consistently", async () => {
  const direct = fixture(undefined);
  const remote = await harness(false);
  const request: PrepareTransactionRequest = {
    kind: "TransferAndCall",
    from: USER,
    underlying: TOKEN,
    wrapper: WRAPPER,
    amount: 1n,
    recipientData: "0x01",
  };
  const transaction: Case["transaction"] = {
    $case: "transferAndCall",
    transferAndCall: {
      underlying: wireBytes(TOKEN),
      wrapper: wireBytes(WRAPPER),
      amount: "1",
      recipientData: Buffer.from([1]),
    },
  };
  try {
    const directError = await direct.sdk.offline.prepare(request).catch((error) => error);
    const actual = await prepare(remote, cases[0]!, false, transaction).catch((error) => error);
    expect(errorCode(directError)).toBeDefined();
    expect(errorCode(actual)).toBe(errorCode(directError));
    expect(direct.provider.prepareTransaction).not.toHaveBeenCalled();
    expect(remote.fixtures[0]?.provider.prepareTransaction).not.toHaveBeenCalled();
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});

test("offline prepare rejects an omitted operator expiry instead of defaulting it", async () => {
  const remote = await harness(false);
  try {
    const error = await prepare(remote, cases[2]!, false, {
      $case: "setOperator",
      setOperator: { token: wireBytes(TOKEN), operator: wireBytes(DELEGATE), until: undefined },
    }).catch((error) => error);
    expect((error as ServiceError).code).toBe(status.INVALID_ARGUMENT);
    expect(remote.fixtures[0]?.provider.prepareTransaction).not.toHaveBeenCalled();
  } finally {
    await remote.close();
  }
});

test("offline prepare preserves provider failures and chain validation", async () => {
  const direct = fixture(undefined);
  const remote = await harness(false);
  const item = cases[0]!;
  try {
    const failure = new Error("provider failed");
    vi.mocked(direct.provider.prepareTransaction).mockRejectedValue(failure);
    vi.mocked(remote.fixtures[0]!.provider.prepareTransaction).mockRejectedValue(failure);
    await expect(direct.sdk.offline.prepare(item.request)).rejects.toThrow("provider failed");
    await expect(prepare(remote, item, false)).rejects.toMatchObject({ code: expect.anything() });

    vi.mocked(direct.provider.prepareTransaction).mockResolvedValue("0xdeadbeef" as Hex);
    vi.mocked(remote.fixtures[0]!.provider.prepareTransaction).mockResolvedValue(
      "0xdeadbeef" as Hex,
    );
    vi.mocked(direct.provider.getChainId).mockResolvedValue(1);
    vi.mocked(remote.fixtures[0]!.provider.getChainId).mockResolvedValue(1);
    const directError = await direct.sdk.offline.prepare(item.request).catch((error) => error);
    const remoteError = await prepare(remote, item, false).catch((error) => error);
    expect(errorCode(remoteError)).toBe(errorCode(directError));
  } finally {
    direct.sdk.dispose();
    await remote.close();
  }
});
