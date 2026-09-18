import { BaseSigner, SigningRejectedError, Token, type WriteContractConfig } from "@zama-fhe/sdk";
import { encodeFunctionData, parseAbi } from "viem";
import { expect, test, vi } from "vitest";
import { bytes, json } from "../src/encoding.js";
import { errorDetails, TransactionCallbackError } from "../src/errors.js";
import { operationContext, RemoteSigner, type SignerStream } from "../src/remote-signer.js";
import { createCoordinator } from "../src/coordination.js";
import { SidecarRuntime } from "../src/runtime.js";
import {
  SignerAction,
  type SignerReply,
  type SignerServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { FakeStream } from "./support/fake-stream.js";
import { frames } from "./support/frames.js";
import { fixture } from "./support/harness.js";

const account = { address: "0x1111111111111111111111111111111111111111" as const, chainId: 31337 };
const target = "0x2222222222222222222222222222222222222222" as const;
const hash = `0x${"ab".repeat(32)}` as const;
const config = {
  address: target,
  abi: parseAbi([
    "function store(uint256 amount, (address owner, int256 delta) info, bytes payload) payable",
  ]),
  functionName: "store",
  args: [2n ** 255n, { owner: account.address, delta: -123n }, "0x00ff"],
} as const;
const contextRequest = {
  config: undefined,
  signerEnabled: true,
  account: { address: bytes(account.address), chainId: 31337n },
  storage: undefined,
  permitStorage: undefined,
  transportKeyPairDerivationSecret: undefined,
};
type Result = SignerReply["result"];
const transactionHash = (value = bytes(hash)): Result => ({
  $case: "transactionHash",
  transactionHash: value,
});
const signature = (value: Buffer): Result => ({ $case: "signature", signature: value });
const failure = (error: unknown): Result => ({ $case: "error", error: errorDetails(error) });

function setup() {
  const controller = new AbortController();
  const signer = new RemoteSigner(account, () => controller.abort());
  const stream = new FakeStream<SignerServerMessage>();
  signer.attach(stream as unknown as SignerStream);
  const write = (id: string, request: WriteContractConfig = config) =>
    operationContext.run({ id, signal: controller.signal }, () => signer.writeContract(request));
  const actions = () => frames(stream.messages, "action").map(({ action }) => action);
  const contractWrite = (index: number) => {
    const request = actions()[index]!.request;
    return request?.$case === "contractWrite" ? request.contractWrite : undefined;
  };
  const reply = (index: number, result: Result, operationId?: string) => {
    const action = actions()[index]!;
    signer.reply({
      operationId: operationId ?? action.operationId,
      actionId: action.actionId,
      result,
    });
  };
  return { signer, stream, controller, write, actions, contractWrite, reply };
}

test("contract writes preserve calldata, full ABI arguments, account, and optional bigint overrides", async () => {
  const h = setup();
  try {
    const first = h.write("omitted");
    const second = h.write("zero", { ...config, value: 0n, gas: 0n });
    const third = h.write("large", { ...config, value: 2n ** 200n, gas: 2n ** 80n });
    const actions = h
      .actions()
      .map((action) => SignerAction.decode(SignerAction.encode(action).finish()));
    expect(actions[0]).toMatchObject({
      account: { address: bytes(account.address), chainId: 31337n },
      request: {
        $case: "contractWrite",
        contractWrite: {
          address: bytes(target),
          data: bytes(encodeFunctionData(config)),
          abiJson: json(config.abi),
          functionName: "store",
          argsJson: json(config.args),
          value: undefined,
          gas: undefined,
        },
      },
    });
    expect(h.contractWrite(1)).toMatchObject({ value: "0", gas: "0" });
    expect(h.contractWrite(2)).toMatchObject({
      value: (2n ** 200n).toString(),
      gas: (2n ** 80n).toString(),
    });
    h.reply(2, transactionHash());
    h.reply(0, transactionHash());
    h.reply(1, transactionHash());
    await expect(Promise.all([first, second, third])).resolves.toEqual([hash, hash, hash]);
  } finally {
    h.signer.dispose();
  }
});

test("mixed signature and write callbacks correlate independently and reject stale replies", async () => {
  const h = setup();
  try {
    const write = h.write("write");
    const sign = operationContext.run({ id: "sign", signal: h.controller.signal }, () =>
      h.signer.signTypedData({ domain: {}, types: {}, message: {}, primaryType: "Test" }),
    );
    expect(h.actions()[1]!.request).toEqual({
      $case: "typedDataJson",
      typedDataJson: json({ domain: {}, types: {}, message: {}, primaryType: "Test" }),
    });
    h.reply(0, transactionHash(), "sign");
    expect(frames(h.stream.messages, "replyError").at(-1)?.replyError.error?.code).toBe(
      "SIGNER_ACTION_NOT_FOUND",
    );
    h.reply(1, signature(Buffer.from([1])));
    await expect(sign).resolves.toBe("0x01");
    h.reply(0, transactionHash());
    await expect(write).resolves.toBe(hash);
    h.reply(0, transactionHash());
    expect(frames(h.stream.messages, "replyError")).toHaveLength(2);
  } finally {
    h.signer.dispose();
  }
});

test.each([
  ["empty hash", transactionHash(Buffer.alloc(0))],
  ["short hash", transactionHash(Buffer.alloc(31))],
  ["long hash", transactionHash(Buffer.alloc(33))],
  ["missing result", undefined],
  ["signature instead of hash", signature(Buffer.from([1]))],
])("a write reply with %s reports an uncertain outcome", async (_, result) => {
  const h = setup();
  const pending = h.write("invalid");
  h.reply(0, result);
  await expect(pending).rejects.toMatchObject({
    code: "TRANSACTION_OUTCOME_UNKNOWN",
    retryable: false,
  });
  h.signer.dispose();
});

test("a wallet write error keeps an invalid retry hint classified as an invalid argument", async () => {
  const h = setup();
  const pending = h.write("invalid-retry");
  h.reply(0, {
    $case: "error",
    error: {
      code: "INVALID_ARGUMENT",
      message: "Bad retry hint",
      retryable: true,
      retryAfterSeconds: 0,
    },
  });
  const error = await pending.catch((error: unknown) => error);
  expect(error).toMatchObject({ code: "INVALID_ARGUMENT", retryable: false });
  expect(error).not.toBeInstanceOf(TransactionCallbackError);
  expect(errorDetails(error)).toEqual({
    code: "INVALID_ARGUMENT",
    message: "Retry delay must be positive whole seconds within uint32 range.",
    retryable: false,
    retryAfterSeconds: undefined,
  });
  h.signer.dispose();
});

test("a transaction hash answering a typed-data request is a signing failure", async () => {
  const h = setup();
  const pending = operationContext.run({ id: "sign", signal: h.controller.signal }, () =>
    h.signer.signTypedData({ domain: {}, types: {}, message: {}, primaryType: "Test" }),
  );
  h.reply(0, transactionHash());
  await expect(pending).rejects.toMatchObject({ code: "SIGNING_FAILED" });
  h.signer.dispose();
});

test("cancellation after broadcast does not accept a late hash or replay on reconnection", async () => {
  const h = setup();
  const pending = h.write("broadcast");
  const settled = pending.catch((error: unknown) => error);
  h.controller.abort(h.signer.abortReason("broadcast"));
  expect(await settled).toMatchObject({ code: "TRANSACTION_OUTCOME_UNKNOWN", retryable: false });
  h.reply(0, transactionHash());
  expect(frames(h.stream.messages, "cancelled")).toHaveLength(1);
  expect(frames(h.stream.messages, "replyError")).toHaveLength(1);
  h.stream.end();
  const next = new FakeStream<SignerServerMessage>();
  h.signer.attach(next as unknown as SignerStream);
  expect(frames(next.messages, "action")).toEqual([]);
  h.signer.dispose();
});

test("channel loss with an outstanding write reports uncertain outcome without replay", async () => {
  const h = setup();
  const pending = h.write("lost");
  h.stream.end();
  await expect(pending).rejects.toMatchObject({
    code: "TRANSACTION_OUTCOME_UNKNOWN",
    retryable: false,
  });
  const next = new FakeStream<SignerServerMessage>();
  h.signer.attach(next as unknown as SignerStream);
  expect(frames(next.messages, "action")).toEqual([]);
  h.signer.dispose();
});

class DirectSigner extends BaseSigner {
  write = vi.fn(async (_config: unknown) => hash);
  constructor() {
    super(account);
  }
  async signTypedData() {
    return "0x01" as const;
  }
  writeContract = this.write;
}

test.each(["success", "rejection", "broadcast failure", "receipt revert"] as const)(
  "SDK Token.setOperator has direct/remote parity: %s",
  async (scenario) => {
    const directSigner = new DirectSigner();
    const direct = fixture(directSigner);
    const h = setup();
    const remote = fixture(h.signer);
    const error =
      scenario === "rejection"
        ? new SigningRejectedError("Wallet declined")
        : new Error("RPC execution reverted");
    if (scenario === "rejection" || scenario === "broadcast failure") {
      directSigner.write.mockRejectedValue(error);
    }
    if (scenario === "receipt revert") {
      vi.mocked(direct.provider.waitForTransactionReceipt).mockRejectedValue(error);
      vi.mocked(remote.provider.waitForTransactionReceipt).mockRejectedValue(error);
    }
    try {
      const local = new Token(direct.sdk, target).setOperator(account.address, 0);
      const localResult = local.then(
        (value) => ({ value }),
        (error: unknown) => ({ error: errorDetails(error) }),
      );
      const bridged = operationContext.run({ id: "token-write", signal: h.controller.signal }, () =>
        new Token(remote.sdk, target).setOperator(account.address, 0),
      );
      const remoteResult = bridged.then(
        (value) => ({ value }),
        (error: unknown) => ({ error: errorDetails(error) }),
      );
      await vi.waitFor(() => expect(h.actions()).toHaveLength(1));
      const original = directSigner.write.mock.calls[0]![0] as WriteContractConfig;
      expect(h.contractWrite(0)).toMatchObject({
        address: bytes(original.address),
        data: bytes(encodeFunctionData(original)),
        abiJson: json(original.abi),
        argsJson: json(original.args),
        functionName: original.functionName,
      });
      expect(remote.provider.waitForTransactionReceipt).not.toHaveBeenCalled();
      if (scenario === "rejection" || scenario === "broadcast failure") {
        h.reply(0, failure(error));
      } else {
        h.reply(0, transactionHash());
      }
      expect(await remoteResult).toEqual(await localResult);
      expect(vi.mocked(remote.provider.waitForTransactionReceipt).mock.calls).toEqual(
        vi.mocked(direct.provider.waitForTransactionReceipt).mock.calls,
      );
      expect(vi.mocked(remote.provider.waitForTransactionReceipt).mock.calls).toEqual(
        scenario === "success" || scenario === "receipt revert" ? [[hash]] : [],
      );
    } finally {
      direct.sdk.dispose();
      remote.sdk.dispose();
      directSigner.dispose();
      h.signer.dispose();
    }
  },
);

test("account updates cancel and drain contract writes before publishing the new snapshot", async () => {
  let signer: RemoteSigner | undefined;
  const runtime = new SidecarRuntime(async (_, remote) => {
    signer = remote;
    return { sdk: fixture(remote).sdk, storageIdentities: [] };
  }, createCoordinator());
  const id = await runtime.createContext(contextRequest);
  const stream = new FakeStream<SignerServerMessage>();
  runtime.attachSigner(id, stream as unknown as SignerStream);
  try {
    const pending = runtime.execute(
      { contextId: id, operationId: "update" },
      new AbortController().signal,
      () => signer!.writeContract(config),
    );
    const settled = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(frames(stream.messages, "action")).toHaveLength(1));
    await runtime.updateAccount({
      contextId: id,
      account: { address: bytes(target), chainId: 31337n },
    });
    expect(await settled).toMatchObject({ code: "TRANSACTION_OUTCOME_UNKNOWN", retryable: false });
    expect(signer!.walletAccount.getSnapshot()?.address).toBe(target);
    expect(frames(stream.messages, "cancelled")).toHaveLength(1);
    const [action] = frames(stream.messages, "action");
    signer!.reply({
      operationId: "update",
      actionId: action!.action.actionId,
      result: transactionHash(),
    });
    expect(frames(stream.messages, "replyError")).toHaveLength(1);
  } finally {
    await runtime.close();
  }
});

test.each(["malformed", "native uncertainty", "channel loss"] as const)(
  "SDK-backed runtime preserves actionable transaction uncertainty: %s",
  async (scenario) => {
    let sdk: ReturnType<typeof fixture>["sdk"];
    const runtime = new SidecarRuntime(async (_, signer) => {
      sdk = fixture(signer).sdk;
      return { sdk, storageIdentities: [] };
    }, createCoordinator());
    const contextId = await runtime.createContext(contextRequest);
    const stream = new FakeStream<SignerServerMessage>();
    const signer = runtime.attachSigner(contextId, stream as unknown as SignerStream);
    try {
      const pending = runtime.execute(
        { contextId, operationId: "uncertain-token" },
        new AbortController().signal,
        () => new Token(sdk, target).setOperator(account.address, 0),
      );
      const outcome = pending.then(
        () => {
          throw new Error("expected rejection");
        },
        (error: unknown) => errorDetails(error),
      );
      await vi.waitFor(() => expect(frames(stream.messages, "action")).toHaveLength(1));
      const action = frames(stream.messages, "action")[0]!.action;
      if (scenario === "channel loss") {
        stream.end();
      } else {
        signer.reply({
          operationId: action.operationId,
          actionId: action.actionId,
          result:
            scenario === "malformed"
              ? transactionHash(Buffer.alloc(31))
              : {
                  $case: "error",
                  // A wallet claiming the uncertain outcome is retryable must not be believed.
                  error: {
                    code: "TRANSACTION_OUTCOME_UNKNOWN",
                    message: "RPC lost reply after broadcast",
                    retryable: true,
                    retryAfterSeconds: 5,
                  },
                },
        });
      }
      expect(await outcome).toEqual({
        code: "TRANSACTION_OUTCOME_UNKNOWN",
        message: expect.any(String),
        retryable: false,
        retryAfterSeconds: undefined,
      });
    } finally {
      await runtime.close();
    }
  },
);

test.each([
  ["typed data", "CANCELLED"],
  ["contract write", "TRANSACTION_OUTCOME_UNKNOWN"],
] as const)("cancelling an operation with a pending %s action reports %s", async (kind, code) => {
  let signer: RemoteSigner | undefined;
  const runtime = new SidecarRuntime(async (_, remote) => {
    signer = remote;
    return { sdk: fixture(remote).sdk, storageIdentities: [] };
  }, createCoordinator());
  const id = await runtime.createContext(contextRequest);
  const stream = new FakeStream<SignerServerMessage>();
  runtime.attachSigner(id, stream as unknown as SignerStream);
  const caller = new AbortController();
  try {
    const pending = runtime.execute({ contextId: id, operationId: "cancel" }, caller.signal, () =>
      kind === "contract write"
        ? signer!.writeContract(config)
        : signer!.signTypedData({ domain: {}, types: {}, message: {}, primaryType: "Test" }),
    );
    const settled = pending.catch((error: unknown) => error);
    await vi.waitFor(() => expect(frames(stream.messages, "action")).toHaveLength(1));
    caller.abort();
    expect(await settled).toMatchObject({ code, retryable: false });
    expect(frames(stream.messages, "cancelled")).toHaveLength(1);
  } finally {
    await runtime.close();
  }
});

async function broadcastRuntime() {
  let created: ReturnType<typeof fixture> | undefined;
  const runtime = new SidecarRuntime(async (_, signer) => {
    created = fixture(signer);
    return { sdk: created.sdk, storageIdentities: [] };
  }, createCoordinator());
  const contextId = await runtime.createContext(contextRequest);
  const stream = new FakeStream<SignerServerMessage>();
  const signer = runtime.attachSigner(contextId, stream as unknown as SignerStream);
  const receipt = Promise.withResolvers<unknown>();
  vi.mocked(created!.provider.waitForTransactionReceipt).mockReturnValue(receipt.promise as never);
  const setOperator = (operationId: string, caller: AbortSignal) =>
    runtime.execute({ contextId, operationId }, caller, () =>
      new Token(created!.sdk, target).setOperator(account.address, 0),
    );
  const replyHash = async () => {
    await vi.waitFor(() => expect(frames(stream.messages, "action")).toHaveLength(1));
    const action = frames(stream.messages, "action")[0]!.action;
    signer.reply({
      operationId: action.operationId,
      actionId: action.actionId,
      result: transactionHash(),
    });
    await vi.waitFor(() =>
      expect(created!.provider.waitForTransactionReceipt).toHaveBeenCalledWith(hash),
    );
  };
  return { runtime, contextId, stream, signer, receipt, setOperator, replyHash };
}

test("cancelling while the SDK awaits a receipt reports the broadcast hash as uncertain", async () => {
  const h = await broadcastRuntime();
  const caller = new AbortController();
  try {
    const settled = h.setOperator("broadcast", caller.signal).catch((error: unknown) => error);
    await h.replyHash();
    caller.abort();
    expect(errorDetails(await settled)).toEqual({
      code: "TRANSACTION_OUTCOME_UNKNOWN",
      message: expect.stringContaining(hash),
      retryable: false,
      retryAfterSeconds: undefined,
    });
  } finally {
    h.receipt.resolve({ logs: [] });
    await h.runtime.close();
  }
});

test.each(["account update", "context close"] as const)(
  "%s while the SDK awaits a receipt reports the broadcast hash as uncertain",
  async (trigger) => {
    const h = await broadcastRuntime();
    try {
      const settled = h
        .setOperator("broadcast", new AbortController().signal)
        .catch((error: unknown) => error);
      await h.replyHash();
      const draining =
        trigger === "account update"
          ? h.runtime.updateAccount({
              contextId: h.contextId,
              account: { address: bytes(target), chainId: 31337n },
            })
          : h.runtime.closeContext(h.contextId);
      expect(errorDetails(await settled)).toEqual({
        code: "TRANSACTION_OUTCOME_UNKNOWN",
        message: expect.stringContaining(hash),
        retryable: false,
        retryAfterSeconds: undefined,
      });
      h.receipt.resolve({ logs: [] });
      await draining;
    } finally {
      h.receipt.resolve({ logs: [] });
      await h.runtime.close();
    }
  },
);

test("a settled operation releases its hash so a later cancellation reports CANCELLED", async () => {
  const h = await broadcastRuntime();
  const caller = new AbortController();
  try {
    const pending = h.setOperator("settled", new AbortController().signal);
    await h.replyHash();
    h.receipt.resolve({ logs: [] });
    await pending;
    await vi.waitFor(() =>
      expect(errorDetails(h.signer.abortReason("settled"))).toMatchObject({ code: "CANCELLED" }),
    );
    const settled = h.runtime
      .execute(
        { contextId: h.contextId, operationId: "plain" },
        caller.signal,
        (_sdk, signal) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
          ),
      )
      .catch((error: unknown) => error);
    caller.abort();
    expect(errorDetails(await settled)).toMatchObject({ code: "CANCELLED", retryable: false });
  } finally {
    await h.runtime.close();
  }
});

test("cancelling a second write still names the transaction already broadcast", async () => {
  let signer: RemoteSigner | undefined;
  const runtime = new SidecarRuntime(async (_, remote) => {
    signer = remote;
    return { sdk: fixture(remote).sdk, storageIdentities: [] };
  }, createCoordinator());
  const id = await runtime.createContext(contextRequest);
  const stream = new FakeStream<SignerServerMessage>();
  runtime.attachSigner(id, stream as unknown as SignerStream);
  const caller = new AbortController();
  try {
    const settled = runtime
      .execute({ contextId: id, operationId: "two-writes" }, caller.signal, async () => {
        await signer!.writeContract(config);
        return signer!.writeContract(config);
      })
      .catch((error: unknown) => error);
    await vi.waitFor(() => expect(frames(stream.messages, "action")).toHaveLength(1));
    const first = frames(stream.messages, "action")[0]!.action;
    signer!.reply({
      operationId: first.operationId,
      actionId: first.actionId,
      result: transactionHash(),
    });
    await vi.waitFor(() => expect(frames(stream.messages, "action")).toHaveLength(2));
    caller.abort();
    expect(errorDetails(await settled)).toEqual({
      code: "TRANSACTION_OUTCOME_UNKNOWN",
      message: expect.stringContaining(hash),
      retryable: false,
      retryAfterSeconds: undefined,
    });
  } finally {
    await runtime.close();
  }
});
