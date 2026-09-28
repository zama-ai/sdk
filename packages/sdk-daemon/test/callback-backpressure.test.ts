import type { ServiceError } from "@grpc/grpc-js";
import { expect, test, vi } from "vitest";
import { CallbackConnection } from "../src/callback-connection.js";
import { RemoteEvents, type EventStream } from "../src/remote-events.js";
import { RemoteSigner, type SignerStream } from "../src/remote-signer.js";
import { RemoteStorage, type StorageStream } from "../src/remote-storage.js";
import { FakeStream } from "./support/fake-stream.js";

for (const kind of ["signer", "storage", "events"] as const) {
  test(`${kind} output overflow sends one classified channel failure`, async () => {
    const stream = new FakeStream<unknown>();
    stream.write = () => false;
    const failures: ServiceError[] = [];
    stream.on("error", (error) => failures.push(error));
    const signer = new RemoteSigner(undefined, () => {});
    const storage = new RemoteStorage();
    const events = new RemoteEvents("context");
    const send = () => {
      if (kind === "signer") {
        signer.reply({ operationId: "stale", actionId: "stale", result: undefined });
      } else if (kind === "storage") {
        storage.reply({ requestId: "stale", result: undefined });
      } else {
        events.reply({ sequence: 99n, outcome: { $case: "acknowledged", acknowledged: {} } });
      }
    };
    try {
      if (kind === "signer") {
        signer.attach(stream as unknown as SignerStream);
      } else if (kind === "storage") {
        storage.attach(stream as unknown as StorageStream);
      } else {
        events.attach(stream as unknown as EventStream);
      }
      for (let index = 0; index < 256; index++) {
        send();
      }
      await Promise.resolve();
      expect(failures).toHaveLength(0);
      send();
      await Promise.resolve();
      expect(failures).toHaveLength(1);
      expect(failures[0]?.metadata.get("zama-error-code")).toEqual(["CALLBACK_BACKPRESSURE"]);
      expect(failures[0]?.code).toBe(8);
    } finally {
      signer.dispose();
      storage.dispose();
      events.dispose();
    }
  });
}

test("a disconnected writer ends once when many queued writes reject", async () => {
  const stream = new FakeStream<unknown>();
  stream.write = () => false;
  const end = vi.spyOn(stream, "end");
  const disconnected = vi.fn();
  const connection = new CallbackConnection(disconnected);
  connection.attach(stream as unknown as EventStream);
  for (let index = 0; index < 20; index++) {
    connection.send({});
  }
  stream.emit("close");
  await Promise.resolve();
  expect(disconnected).toHaveBeenCalledTimes(1);
  expect(end).not.toHaveBeenCalled();
});
