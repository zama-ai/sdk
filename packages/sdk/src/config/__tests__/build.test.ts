import { beforeEach, describe, expect, test, vi } from "vitest";
import { hardhat } from "../../chains";
import { ConfigurationError } from "../../errors";
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

  test("allows later configs that do not specify runtime options", () => {
    const provider = {} as never;
    buildZamaConfig(undefined, provider, params());

    expect(() => buildZamaConfig(undefined, provider, params())).not.toThrow();
    expect(fhevmRuntime.setFhevmRuntimeConfig).toHaveBeenCalledOnce();
  });

  test.each([
    { label: "identical", secondValue: true },
    { label: "different", secondValue: false },
  ])("rejects later $label explicit runtime options", ({ secondValue }) => {
    const provider = {} as never;
    buildZamaConfig(undefined, provider, params({ singleThread: true }));

    expect(() =>
      buildZamaConfig(undefined, provider, params({ singleThread: secondValue })),
    ).toThrow(ConfigurationError);
    expect(() =>
      buildZamaConfig(undefined, provider, params({ singleThread: secondValue })),
    ).toThrow("FHEVM runtime configuration is already set and cannot be changed.");
  });
});
