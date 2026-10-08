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
    const telemetry: TelemetryState = { layer: "core" };
    node().createRelayer(anvil, new LoggerService(), telemetry);

    expect(relayerConfig().telemetry).toEqual({ state: telemetry, runtime: "node" });
  });

  test("ZAMA_SDK_TELEMETRY=0 turns telemetry off for the process", () => {
    vi.stubEnv("ZAMA_SDK_TELEMETRY", "0");
    node().createRelayer(anvil, new LoggerService(), { layer: "core" });

    expect(relayerConfig().telemetry).toBeUndefined();
  });

  test("sends no telemetry without a config-wide context", () => {
    node().createRelayer(anvil, new LoggerService());

    expect(relayerConfig().telemetry).toBeUndefined();
  });
});
