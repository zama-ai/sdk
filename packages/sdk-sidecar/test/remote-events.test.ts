import { expect, test } from "vitest";
import { RemoteEvents, type EventStream } from "../src/remote-events.js";
import { operationContext } from "../src/remote-signer.js";
import {
  ProgressKind,
  type EventServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { FakeStream } from "./support/fake-stream.js";

const payload = {
  $case: "progress",
  progress: { kind: ProgressKind.PROGRESS_KIND_FINALIZING, txHash: undefined },
} as const;
function setup() {
  const events = new RemoteEvents("context");
  const stream = new FakeStream<EventServerMessage>();
  events.attach(stream as unknown as EventStream);
  return { events, stream };
}

test("notifications preserve order and distinct RPC correlation", () => {
  const { events, stream } = setup();
  operationContext.run({ id: "operation", signal: new AbortController().signal }, () =>
    events.notify(payload),
  );
  events.notify(payload);
  expect(stream.messages.slice(1).map((frame) => frame.message)).toMatchObject([
    { delivery: { sequence: 1n, contextId: "context", operationId: "operation" } },
    { delivery: { sequence: 2n, operationId: "" } },
  ]);
  events.dispose();
});

test("the 256 delivery window frees capacity on acknowledgment or handler error", () => {
  const { events, stream } = setup();
  for (let index = 0; index < 256; index++) {
    events.notify(payload);
  }
  expect(stream.messages).toHaveLength(257);
  events.reply({ sequence: 1n, outcome: { $case: "acknowledged", acknowledged: {} } });
  events.reply({
    sequence: 2n,
    outcome: {
      $case: "error",
      error: {
        code: "CALLBACK_FAILED",
        message: "sink failed",
        retryable: false,
        retryAfterSeconds: undefined,
      },
    },
  });
  events.notify(payload);
  events.notify(payload);
  expect(stream.messages).toHaveLength(259);
  const failed: unknown[] = [];
  stream.on("error", (error) => failed.push(error));
  events.notify(payload);
  expect(stream.messages).toHaveLength(259);
  expect(failed).toHaveLength(1);
  expect(failed[0]).toMatchObject({ code: 8 });
  const replacement = new FakeStream<EventServerMessage>();
  events.attach(replacement as unknown as EventStream);
  events.notify(payload);
  expect(replacement.messages[1]?.message).toMatchObject({ delivery: { sequence: 259n } });
  events.dispose();
});

test("channel cancellation clears outstanding notifications without replay", () => {
  const { events, stream } = setup();
  events.notify(payload);
  stream.emit("cancelled");
  events.notify(payload);
  const replacement = new FakeStream<EventServerMessage>();
  events.attach(replacement as unknown as EventStream);
  expect(replacement.messages).toHaveLength(1);
  events.reply({ sequence: 1n, outcome: { $case: "acknowledged", acknowledged: {} } });
  expect(replacement.messages.at(-1)?.message).toMatchObject({
    replyError: { sequence: 1n, error: { code: "EVENT_DELIVERY_NOT_FOUND" } },
  });
  events.notify(payload);
  expect(replacement.messages.at(-1)?.message).toMatchObject({ delivery: { sequence: 2n } });
  events.dispose();
});

test("context cleanup closes notifications and unsubscribes the wallet", () => {
  const { events, stream } = setup();
  let subscribed = true;
  let closed = false;
  stream.on("close", () => {
    closed = true;
  });
  events.observeWallet({
    onWalletAccountChange: () => () => {
      subscribed = false;
    },
  });
  events.notify(payload);
  events.dispose();
  events.notify(payload);
  expect(subscribed).toBe(false);
  expect(closed).toBe(true);
  expect(stream.messages).toHaveLength(2);
});

test("a missing notification outcome is rejected", () => {
  const { events, stream } = setup();
  events.notify(payload);
  expect(() => events.reply({ sequence: 1n, outcome: undefined })).toThrow(
    "acknowledgment or handler error",
  );
  events.reply({ sequence: 1n, outcome: { $case: "acknowledged", acknowledged: {} } });
  expect(stream.messages).toHaveLength(2);
  events.dispose();
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
