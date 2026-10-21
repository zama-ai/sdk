import { FakeStream } from "./support/fake-stream.js";
import { frames } from "./support/frames.js";
import { expect, test } from "vitest";
import { parseAbi } from "viem";
import { operationContext, RemoteSigner, type SignerStream } from "../src/remote-signer.js";
import type { SignerServerMessage } from "../src/generated/zama/sdk/v1beta1/daemon.js";

const account = {
  address: "0x1111111111111111111111111111111111111111" as const,
  chainId: 11155111,
};
const typedData = {
  domain: { name: "Test" },
  types: { Request: [{ name: "value", type: "uint256" }] },
  primaryType: "Request",
  message: { value: 1n },
};

function setup() {
  const controller = new AbortController();
  const signer = new RemoteSigner(account, () => controller.abort());
  const stream = new FakeStream<SignerServerMessage>();
  signer.attach(stream as unknown as SignerStream);
  const sign = (id: string) =>
    operationContext.run({ id, signal: controller.signal }, () => signer.signTypedData(typedData));
  return { controller, signer, stream, sign };
}
test("signer routes replies by operation and action without killing unrelated work", async () => {
  const { signer, stream, sign } = setup();
  const first = sign("first");
  const second = sign("second");
  const [a, b] = frames(stream.messages, "action").map((message) => message.action);
  expect(a).toBeDefined();
  expect(b).toBeDefined();
  signer.reply({
    operationId: "wrong",
    actionId: a!.actionId,
    result: { $case: "signature", signature: Buffer.from([1]) },
  });
  expect(frames(stream.messages, "replyError").at(-1)?.replyError.error?.code).toBe(
    "SIGNER_ACTION_NOT_FOUND",
  );
  signer.reply({
    operationId: "second",
    actionId: b!.actionId,
    result: { $case: "signature", signature: Buffer.from([2]) },
  });
  await expect(second).resolves.toBe("0x02");
  signer.reply({
    operationId: "first",
    actionId: a!.actionId,
    result: { $case: "signature", signature: Buffer.from([1]) },
  });
  await expect(first).resolves.toBe("0x01");
  signer.dispose();
});
test("cancellation cancels the wallet action and rejects late SDK signer callbacks", async () => {
  const { controller, signer, stream, sign } = setup();
  const pending = sign("cancelled");
  controller.abort(signer.abortReason("cancelled"));
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  expect(frames(stream.messages, "cancelled").at(-1)?.cancelled.operationId).toBe("cancelled");
  await expect(sign("late")).rejects.toMatchObject({ code: "CANCELLED" });
  signer.dispose();
});
test("signer channel disconnect rejects pending work and reattachment never replays actions", async () => {
  const { signer, stream, sign } = setup();
  const pending = sign("pending");
  stream.end();
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  const next = new FakeStream<SignerServerMessage>();
  signer.attach(next as unknown as SignerStream);
  expect(next.messages).toEqual([{ message: { $case: "attached", attached: {} } }]);
  signer.dispose();
});
test("wallet actions are not capped at an arbitrary count", async () => {
  const { signer, sign } = setup();
  const pending = Array.from({ length: 40 }, (_, index) => sign(String(index)));
  const settled = Promise.allSettled(pending);

  signer.dispose();
  expect((await settled).every((result) => result.status === "rejected")).toBe(true);
});

test("unattached signer streams expire without imposing a wallet signing deadline", async () => {
  const { vi } = await import("vitest");
  const { createHandlers } = await import("../src/handlers.js");
  const { DaemonRuntime } = await import("../src/runtime.js");
  const { createCoordinator } = await import("../src/coordination.js");
  vi.useFakeTimers();
  try {
    const runtime = new DaemonRuntime(async () => {
      throw new Error("unused");
    }, createCoordinator());
    const stream = new FakeStream<SignerServerMessage>();
    const closed = vi.fn();
    const failed = vi.fn(() => stream.end());
    stream.on("error", failed);
    stream.on("close", closed);
    createHandlers(runtime, "test").signerChannel(stream as unknown as SignerStream);
    await vi.advanceTimersByTimeAsync(4999);
    expect(closed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(closed).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledWith(expect.objectContaining({ code: 4 }));
  } finally {
    vi.useRealTimers();
  }
});

test("a missing signer result rejects only the corresponding operation", async () => {
  const { signer, stream, sign } = setup();
  const pending = sign("malformed");
  signer.reply({
    operationId: "malformed",
    actionId: frames(stream.messages, "action")[0]!.action.actionId,
    result: undefined,
  });
  await expect(pending).rejects.toMatchObject({ code: "SIGNING_FAILED" });
  signer.dispose();
});

test("recorded write hashes survive the reply and disappear on release", async () => {
  const { controller, signer, stream } = setup();
  const config = {
    address: "0x2222222222222222222222222222222222222222",
    abi: parseAbi(["function store(uint256 amount)"]),
    functionName: "store",
    args: [1n],
  } as const;
  const hash = `0x${"ab".repeat(32)}`;
  signer.track("write");
  const pending = operationContext.run({ id: "write", signal: controller.signal }, () =>
    signer.writeContract(config),
  );
  signer.reply({
    operationId: "write",
    actionId: frames(stream.messages, "action")[0]!.action.actionId,
    result: { $case: "transactionHash", transactionHash: Buffer.from(hash.slice(2), "hex") },
  });
  await expect(pending).resolves.toBe(hash);
  expect(signer.abortReason("write")).toMatchObject({
    code: "TRANSACTION_OUTCOME_UNKNOWN",
    retryable: false,
    message: expect.stringContaining(hash),
  });
  signer.release("write");
  expect(signer.abortReason("write")).toMatchObject({ code: "CANCELLED" });
  // A reply for an operation that already settled must not resurrect its entry.
  const late = operationContext.run({ id: "write", signal: controller.signal }, () =>
    signer.writeContract(config),
  );
  signer.reply({
    operationId: "write",
    actionId: frames(stream.messages, "action")[1]!.action.actionId,
    result: { $case: "transactionHash", transactionHash: Buffer.from(hash.slice(2), "hex") },
  });
  await expect(late).resolves.toBe(hash);
  expect(signer.abortReason("write")).toMatchObject({ code: "CANCELLED" });
  signer.dispose();
});
