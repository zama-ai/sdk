import { status, type ServiceError } from "@grpc/grpc-js";
import { expect, test } from "vitest";
import { createHandlers } from "../src/handlers.js";
import { createCoordinator } from "../src/coordination.js";
import { DaemonRuntime } from "../src/runtime.js";
import type { EventStream } from "../src/remote-events.js";
import { FakeStream } from "./support/fake-stream.js";
import { createContext, fixture, testServer } from "./support/harness.js";

for (const kind of ["signer", "storage"] as const) {
  test(`${kind} attachment rejection preserves status and trailers`, async () => {
    const server = await testServer(async () => ({
      sdk: fixture(undefined).sdk,
      storageIdentities: [],
    }));
    const contextId = await createContext(server.client, { signerEnabled: true });
    const open = () => {
      if (kind === "signer") {
        const stream = server.client.signerChannel();
        return {
          stream,
          attach: () => stream.write({ message: { $case: "attach", attach: { contextId } } }),
        };
      }
      const stream = server.client.storageChannel();
      return {
        stream,
        attach: () => stream.write({ message: { $case: "attach", attach: { contextId } } }),
      };
    };
    const first = open();
    const second = open();
    try {
      const ready = new Promise<void>((resolve, reject) => {
        first.stream.once("error", reject);
        first.stream.once("data", () => resolve());
      });
      first.attach();
      await ready;
      const rejected = new Promise<ServiceError>((resolve) => second.stream.once("error", resolve));
      second.attach();
      const error = await rejected;
      expect(error.code).toBe(
        kind === "signer" ? status.ALREADY_EXISTS : status.FAILED_PRECONDITION,
      );
      expect(error.metadata.get("zama-error-code")).toEqual([
        kind === "signer" ? "SIGNER_ATTACHED" : "STORAGE_CHANNEL_EXISTS",
      ]);
    } finally {
      first.stream.cancel();
      second.stream.cancel();
      await server.close();
    }
  });
}

test.each(["end", "error", "cancelled", "close"])("%s stops accepting callback frames", (event) => {
  const runtime = new DaemonRuntime(async () => {
    throw new Error("unused");
  }, createCoordinator());
  const stream = new FakeStream();
  createHandlers(runtime, "test").eventChannel(stream as unknown as EventStream);
  expect(stream.listenerCount("data")).toBe(1);
  stream.emit(event);
  expect(stream.listenerCount("data")).toBe(0);
});
