import { FakeStream } from "./support/fake-stream.js";
import { frames } from "./support/frames.js";
import { expect, test } from "vitest";
import { operationContext, RemoteSigner, type SignerStream } from "../src/remote-signer.js";
import type { SignerServerMessage } from "../src/generated/zama/sdk/v1alpha1/sidecar.js";

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
    signature: Buffer.from([1]),
    error: undefined,
  });
  expect(frames(stream.messages, "replyError").at(-1)?.replyError.error?.code).toBe(
    "SIGNER_ACTION_NOT_FOUND",
  );
  signer.reply({
    operationId: "second",
    actionId: b!.actionId,
    signature: Buffer.from([2]),
    error: undefined,
  });
  await expect(second).resolves.toBe("0x02");
  signer.reply({
    operationId: "first",
    actionId: a!.actionId,
    signature: Buffer.from([1]),
    error: undefined,
  });
  await expect(first).resolves.toBe("0x01");
  signer.dispose();
});
test("cancellation cancels the wallet action and rejects late SDK signer callbacks", async () => {
  const { controller, signer, stream, sign } = setup();
  const pending = sign("cancelled");
  controller.abort();
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
  const { SidecarRuntime } = await import("../src/runtime.js");
  const { createCoordinator } = await import("../src/coordination.js");
  vi.useFakeTimers();
  try {
    const runtime = new SidecarRuntime(async () => {
      throw new Error("unused");
    }, createCoordinator());
    const stream = new FakeStream<SignerServerMessage>();
    const closed = vi.fn();
    stream.on("close", closed);
    createHandlers(runtime, "test").signerChannel(stream as unknown as SignerStream);
    await vi.advanceTimersByTimeAsync(4999);
    expect(closed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(closed).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
