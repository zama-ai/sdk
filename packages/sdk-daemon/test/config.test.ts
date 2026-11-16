import { expect, test } from "vitest";
import { readConfig } from "../src/config.js";

test("memory/application storage requires no daemon persistence directory", () => {
  expect(
    readConfig({
      ZAMA_SDK_DAEMON_SOCKET_PATH: "/tmp/sdk.sock",
      PRIVATE_KEY: "",
      TEST_WALLET_PRIVATE_KEY: "",
    }),
  ).toEqual({
    socketPath: "/tmp/sdk.sock",
    storageDirectory: undefined,
    grpc: { maxMessageBytes: 4 * 1024 * 1024, maxConcurrentStreams: undefined },
    runtimeLimits: { maxContexts: undefined, maxOperationsPerContext: undefined },
    shutdownTimeoutMs: 120_000,
  });
});

test("deployment resource limits are explicit and configurable", () => {
  expect(
    readConfig({
      ZAMA_SDK_DAEMON_SOCKET_PATH: "/tmp/sdk.sock",
      ZAMA_SDK_DAEMON_MAX_MESSAGE_BYTES: "8388608",
      ZAMA_SDK_DAEMON_MAX_CONCURRENT_STREAMS: "100",
      ZAMA_SDK_DAEMON_MAX_CONTEXTS: "20",
      ZAMA_SDK_DAEMON_MAX_OPERATIONS_PER_CONTEXT: "30",
      ZAMA_SDK_DAEMON_SHUTDOWN_TIMEOUT_MS: "5000",
    }),
  ).toMatchObject({
    grpc: { maxMessageBytes: 8388608, maxConcurrentStreams: 100 },
    runtimeLimits: { maxContexts: 20, maxOperationsPerContext: 30 },
    shutdownTimeoutMs: 5000,
  });
});

test.each(
  ["ZAMA_SDK_DAEMON_MAX_MESSAGE_BYTES", "ZAMA_SDK_DAEMON_SHUTDOWN_TIMEOUT_MS"].flatMap((name) =>
    ["0", "-1", "1.5", "Infinity", ""].map((value) => [name, value]),
  ),
)("rejects invalid %s %j", (name, value) => {
  expect(() => readConfig({ ZAMA_SDK_DAEMON_SOCKET_PATH: "/tmp/sdk.sock", [name]: value })).toThrow(
    `${name} must be a positive integer.`,
  );
});
