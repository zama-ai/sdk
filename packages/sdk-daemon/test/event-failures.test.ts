import type { ServiceError } from "@grpc/grpc-js";
import { expect, test, vi } from "vitest";
import { RemoteEvents, type EventStream } from "../src/remote-events.js";
import { EventReply, type EventServerMessage } from "../src/generated/zama/sdk/v1beta1/daemon.js";
import { FakeStream } from "./support/fake-stream.js";
import { operationContext } from "../src/remote-signer.js";

test("event encoding failure terminates the subscription with a safe typed error", () => {
  const events = new RemoteEvents("context");
  const stream = new FakeStream<EventServerMessage>();
  const errors: ServiceError[] = [];
  stream.on("error", (error) => errors.push(error));
  events.attach(stream as unknown as EventStream);
  const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
  try {
    events.onEvent({
      type: "decrypt:end",
      timestamp: 1,
      durationMs: 1,
      encryptedValues: ["0xzz"],
      result: {},
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.metadata.get("zama-error-code")).toEqual(["EVENT_ENCODING_FAILED"]);
    expect(errors[0]?.message).toBe("SDK notification could not be encoded.");
    events.onEvent({ type: "encrypt:start", timestamp: 2 });
    expect(stream.messages).toHaveLength(1);
    expect(stderr.mock.calls).toEqual([
      ["[zama-daemon] EVENT_ENCODING_FAILED (details omitted)\n"],
    ]);
  } finally {
    stderr.mockRestore();
    events.dispose();
  }
});

test("an unknown reply outcome is rejected without freeing delivery state", () => {
  const events = new RemoteEvents("context");
  const stream = new FakeStream<EventServerMessage>();
  events.attach(stream as unknown as EventStream);
  events.onEvent({ type: "encrypt:start", timestamp: 1 });
  // Sequence 1 followed by future field 42 containing an empty message.
  const future = EventReply.decode(Uint8Array.from([8, 1, 210, 2, 0]));
  expect(() => events.reply(future)).toThrow("acknowledgment or handler error");
  events.reply({ sequence: 1n, outcome: { $case: "acknowledged", acknowledged: {} } });
  expect(stream.messages).toHaveLength(2);
  events.dispose();
});

test("late SDK notifications retain correlation after unary cancellation", () => {
  const events = new RemoteEvents("context");
  const stream = new FakeStream<EventServerMessage>();
  events.attach(stream as unknown as EventStream);
  const controller = new AbortController();
  operationContext.run({ id: "cancelled-operation", signal: controller.signal }, () => {
    controller.abort();
    events.onEvent({ type: "encrypt:start", timestamp: 1 });
  });
  expect(stream.messages.at(-1)?.message).toMatchObject({
    delivery: { operationId: "cancelled-operation" },
  });
  events.dispose();
});
