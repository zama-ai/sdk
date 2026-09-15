import { expect, test } from "vitest";
import { SigningRejectedError } from "@zama-fhe/sdk";
import { RemoteEvents, type EventStream } from "../src/remote-events.js";
import { operationContext } from "../src/remote-signer.js";
import {
  ProgressKind,
  type EventServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { FakeStream } from "./support/fake-stream.js";

const token = "0x1111111111111111111111111111111111111111";
const payload = {
  $case: "progress",
  progress: { kind: ProgressKind.PROGRESS_KIND_FINALIZING, txHash: undefined },
} as const;
function setup(capacity = 256) {
  const events = new RemoteEvents("context", capacity);
  const stream = new FakeStream<EventServerMessage>();
  events.attach(stream as unknown as EventStream);
  const controller = new AbortController();
  return {
    events,
    stream,
    controller,
    request: () =>
      operationContext.run({ id: "operation", signal: controller.signal }, () =>
        events.requestBatchFallback(new SigningRejectedError("rejected"), token),
      ),
  };
}

test("notification ordering, operation correlation and acknowledgment window", () => {
  const { events, stream, controller } = setup(2);
  operationContext.run({ id: "operation", signal: controller.signal }, () =>
    events.notify(payload),
  );
  events.notify(payload);
  expect(stream.messages.slice(1).map((frame) => frame.message)).toMatchObject([
    { delivery: { sequence: 1n, contextId: "context", operationId: "operation" } },
    { delivery: { sequence: 2n, operationId: "" } },
  ]);
  events.reply({ sequence: 1n, outcome: { $case: "acknowledged", acknowledged: {} } });
  events.notify(payload);
  expect(stream.messages).toHaveLength(4);
  events.notify(payload);
  const replacement = new FakeStream<EventServerMessage>();
  events.attach(replacement as unknown as EventStream);
  events.notify(payload);
  expect(replacement.messages).toHaveLength(2);
  expect(replacement.messages[1]?.message).toMatchObject({ delivery: { sequence: 4n } });
  events.dispose();
});

test("batch callbacks preserve arbitrary bigint, errors and stale reply isolation", async () => {
  const { events, request, stream } = setup();
  const result = request();
  events.reply({ sequence: 99n, outcome: { $case: "fallbackBigint", fallbackBigint: "1" } });
  expect(stream.messages.at(-1)?.message).toMatchObject({
    replyError: { error: { code: "EVENT_DELIVERY_NOT_FOUND" } },
  });
  events.reply({
    sequence: 1n,
    outcome: { $case: "fallbackBigint", fallbackBigint: (2n ** 255n).toString() },
  });
  await expect(result).resolves.toBe(2n ** 255n);
  const failed = request();
  events.reply({
    sequence: 2n,
    outcome: {
      $case: "error",
      error: {
        code: "SIGNING_REJECTED",
        message: "callback rejected",
        retryable: false,
        retryAfterSeconds: undefined,
      },
    },
  });
  await expect(failed).rejects.toMatchObject({
    code: "SIGNING_REJECTED",
    message: "callback rejected",
  });
  const malformed = request();
  events.reply({ sequence: 3n, outcome: { $case: "fallbackBigint", fallbackBigint: "01" } });
  await expect(malformed).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  events.dispose();
});

test("cancellation retires a callback and never replays it", async () => {
  const { events, controller, request, stream } = setup();
  const pending = request();
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  expect(stream.messages.at(-1)?.message).toEqual({
    $case: "cancelled",
    cancelled: { sequence: 1n },
  });
  events.reply({ sequence: 1n, outcome: { $case: "fallbackBigint", fallbackBigint: "0" } });
  expect(stream.messages.at(-1)?.message?.$case).toBe("replyError");
  events.dispose();
});

test("channel loss rejects pending callbacks; notifications stay nonblocking", async () => {
  const { events, request, stream } = setup();
  const pending = request();
  stream.emit("cancelled");
  await expect(pending).rejects.toMatchObject({ code: "CANCELLED" });
  events.notify(payload);
  await expect(request()).rejects.toMatchObject({ code: "EVENT_DISCONNECTED" });
  const replacement = new FakeStream<EventServerMessage>();
  events.attach(replacement as unknown as EventStream);
  expect(replacement.messages).toHaveLength(1);
  events.dispose();
});

test("overflow rejects callbacks and context cleanup unsubscribes wallet", async () => {
  const { events, request } = setup(1);
  let subscribed = true;
  events.observeWallet({
    onWalletAccountChange: () => () => {
      subscribed = false;
    },
  });
  const pending = request();
  events.notify(payload);
  await expect(pending).rejects.toThrow("unacknowledged delivery limit");
  events.dispose();
  expect(subscribed).toBe(false);
});

test("stale replies cannot grow a blocked output queue without bound", async () => {
  const { events, stream } = setup();
  stream.write = () => false;
  for (let index = 0; index < 300; index++) {
    events.reply({ sequence: 999n, outcome: { $case: "acknowledged", acknowledged: {} } });
  }
  await Promise.resolve();
  const replacement = new FakeStream<EventServerMessage>();
  expect(() => events.attach(replacement as unknown as EventStream)).not.toThrow();
  events.dispose();
});

test("repeated callback cancellation cannot bypass the blocked output limit", async () => {
  const { events, stream } = setup();
  stream.write = () => false;
  const pending: Promise<bigint>[] = [];
  for (let index = 0; index < 300; index++) {
    const controller = new AbortController();
    pending.push(
      operationContext.run({ id: `operation-${index}`, signal: controller.signal }, () =>
        events.requestBatchFallback(new Error("failure"), token),
      ),
    );
    controller.abort();
  }
  const outcomes = await Promise.allSettled(pending);
  expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
  const replacement = new FakeStream<EventServerMessage>();
  expect(() => events.attach(replacement as unknown as EventStream)).not.toThrow();
  events.dispose();
});
