import { expect, test } from "vitest";
import { readConfig } from "../src/config.js";

test("memory/application storage requires no sidecar persistence directory", () => {
  expect(
    readConfig({
      SIDECAR_SOCKET_PATH: "/tmp/sdk.sock",
      PRIVATE_KEY: "",
      TEST_WALLET_PRIVATE_KEY: "",
    }),
  ).toEqual({
    socketPath: "/tmp/sdk.sock",
    storageDirectory: undefined,
    grpc: { maxMessageBytes: 4 * 1024 * 1024, maxConcurrentStreams: undefined },
    runtimeLimits: { maxContexts: undefined, maxOperationsPerContext: undefined },
  });
});

test("deployment resource limits are explicit and configurable", () => {
  expect(
    readConfig({
      SIDECAR_SOCKET_PATH: "/tmp/sdk.sock",
      SIDECAR_MAX_MESSAGE_BYTES: "8388608",
      SIDECAR_MAX_CONCURRENT_STREAMS: "100",
      SIDECAR_MAX_CONTEXTS: "20",
      SIDECAR_MAX_OPERATIONS_PER_CONTEXT: "30",
    }),
  ).toMatchObject({
    grpc: { maxMessageBytes: 8388608, maxConcurrentStreams: 100 },
    runtimeLimits: { maxContexts: 20, maxOperationsPerContext: 30 },
  });
});

test.each(["0", "-1", "1.5", "Infinity", ""])("rejects invalid transport limit %j", (value) => {
  expect(() =>
    readConfig({ SIDECAR_SOCKET_PATH: "/tmp/sdk.sock", SIDECAR_MAX_MESSAGE_BYTES: value }),
  ).toThrow("must be a positive integer");
});
