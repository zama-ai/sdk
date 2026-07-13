import { beforeEach, describe, expect, test, vi } from "vitest";
import { hardhat } from "../../chains";
import type { RelayerConfig, ZamaConfigBase } from "../types";

const fhevmRuntime = vi.hoisted(() => ({
  configured: false,
  setFhevmRuntimeConfig: vi.fn(() => {
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

  test("allows later configs that do not specify runtime options", () => {
    const provider = {} as never;
    buildZamaConfig(undefined, provider, params());

    expect(() => buildZamaConfig(undefined, provider, params())).not.toThrow();
    expect(fhevmRuntime.setFhevmRuntimeConfig).toHaveBeenCalledOnce();
  });

  test("rejects later explicit runtime options", () => {
    const provider = {} as never;
    buildZamaConfig(undefined, provider, params({ singleThread: true }));

    expect(() => buildZamaConfig(undefined, provider, params({ singleThread: false }))).toThrow(
      "FHEVM runtime configuration is already set and cannot be changed.",
    );
  });
});
