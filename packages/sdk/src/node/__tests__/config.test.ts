import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { FhevmRelayerConfig } from "../../relayer/fhevm-relayer";

vi.mock("../../relayer/fhevm-relayer", () => ({
  FhevmRelayer: vi.fn(function FhevmRelayerMock(_config: FhevmRelayerConfig) {
    return {};
  }),
}));

import { anvil } from "../../chains";
import { FhevmRelayer } from "../../relayer/fhevm-relayer";
import { LoggerService } from "../../services/logger-service";
import type { TelemetryState } from "../../telemetry";
import { node } from "../config";

function relayerConfig(): FhevmRelayerConfig {
  return vi.mocked(FhevmRelayer).mock.calls[0]![0];
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("node() telemetry", () => {
  test("tags the relayer as the node runtime", () => {
    const telemetry: TelemetryState = { layer: "core", mode: "header" };
    node().createRelayer(anvil, new LoggerService(), telemetry);

    expect(relayerConfig().telemetry).toEqual({
      state: telemetry,
      runtime: "node",
      mode: "header",
    });
  });

  test.each(["0", "off"])("ZAMA_SDK_TELEMETRY=%s turns telemetry off for the process", (value) => {
    vi.stubEnv("ZAMA_SDK_TELEMETRY", value);
    node().createRelayer(anvil, new LoggerService(), { layer: "core", mode: "header" });

    expect(relayerConfig().telemetry).toBeUndefined();
  });

  test.each([
    { env: undefined, config: "query", mode: "query" },
    { env: "query", config: "header", mode: "query" },
    { env: "header", config: "query", mode: "header" },
    { env: "yes", config: "query", mode: "query" },
  ] as const)(
    "ZAMA_SDK_TELEMETRY=$env with telemetry: $config sends $mode",
    ({ env, config, mode }) => {
      if (env !== undefined) {
        vi.stubEnv("ZAMA_SDK_TELEMETRY", env);
      }
      const telemetry: TelemetryState = { layer: "core", mode: config };
      node().createRelayer(anvil, new LoggerService(), telemetry);

      expect(relayerConfig().telemetry).toEqual({ state: telemetry, runtime: "node", mode });
    },
  );

  test.each([undefined, "query"])(
    "sends no telemetry without a config-wide context, even with ZAMA_SDK_TELEMETRY=%j",
    (env) => {
      if (env !== undefined) {
        vi.stubEnv("ZAMA_SDK_TELEMETRY", env);
      }
      node().createRelayer(anvil, new LoggerService());

      expect(relayerConfig().telemetry).toBeUndefined();
    },
  );
});
