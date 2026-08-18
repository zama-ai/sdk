import { beforeEach, describe, expect, test, vi } from "vitest";
import { hardhat } from "../../chains";
import type { FhevmRuntimeConfig } from "../../relayer/types";
import type { RelayerConfig, ZamaConfigBase } from "../types";

const fhevmRuntime = vi.hoisted(() => ({
  configured: false,
  setFhevmRuntimeConfig: vi.fn((_config: FhevmRuntimeConfig) => {
    fhevmRuntime.configured = true;
  }),
}));

vi.mock("@fhevm/sdk/viem", () => ({
  hasFhevmRuntimeConfig: () => fhevmRuntime.configured,
  setFhevmRuntimeConfig: fhevmRuntime.setFhevmRuntimeConfig,
}));

import { buildZamaConfig } from "../build";

const relayerConfig = {
  type: "test",
  createRelayer: vi.fn(() => ({})),
} as unknown as RelayerConfig;

function params(runtime?: ZamaConfigBase["runtime"]): ZamaConfigBase {
  return {
    chains: [hardhat],
    relayers: { [hardhat.id]: relayerConfig },
    ...(runtime !== undefined && { runtime }),
  };
}

beforeEach(() => {
  fhevmRuntime.configured = false;
  fhevmRuntime.setFhevmRuntimeConfig.mockClear();
});

describe("buildZamaConfig FHEVM runtime configuration", () => {
  test("applies the runtime configuration once", () => {
    buildZamaConfig(undefined, {} as never, params({ singleThread: true }));

    expect(fhevmRuntime.setFhevmRuntimeConfig).toHaveBeenCalledOnce();
    expect(fhevmRuntime.setFhevmRuntimeConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleVersions: "auto",
        singleThread: true,
        wasmAssetLoadMode: "auto",
      }),
    );
  });

  test("forwards FHEVM runtime logs to the configured SDK logger", () => {
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    buildZamaConfig(undefined, {} as never, { ...params(), logger });
    const runtimeConfig = fhevmRuntime.setFhevmRuntimeConfig.mock.calls[0]?.[0];
    const cause = new Error("cause");

    runtimeConfig?.logger?.error?.("error", cause);
    runtimeConfig?.logger?.warn?.("warn");
    runtimeConfig?.logger?.debug?.("debug");

    expect(logger.error).toHaveBeenCalledWith("error", { cause });
    expect(logger.warn).toHaveBeenCalledWith("warn");
    expect(logger.debug).toHaveBeenCalledWith("debug");
  });

  // Once the runtime is set, no later config re-applies it: only one carrying its own
  // `runtime` options loses something, so only that one warns.
  test.each([
    { label: "warns", secondRuntime: { singleThread: false }, level: "warn" as const },
    { label: "logs at debug", secondRuntime: undefined, level: "debug" as const },
  ])("$label on a later config, without throwing", ({ secondRuntime, level }) => {
    const provider = {} as never;
    const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    buildZamaConfig(undefined, provider, params({ singleThread: true }));

    expect(() =>
      buildZamaConfig(undefined, provider, { ...params(secondRuntime), logger }),
    ).not.toThrow();
    // LoggerService forwards `(prefixedMessage, data?)`, so assert the message
    // arg rather than an exact call shape.
    expect(logger[level].mock.calls[0]?.[0]).toBe(
      "[zama-sdk] runtime configuration is already set and cannot be changed.",
    );
    expect(logger[level === "warn" ? "debug" : "warn"]).not.toHaveBeenCalled();
    expect(fhevmRuntime.setFhevmRuntimeConfig).toHaveBeenCalledOnce();
  });
});
