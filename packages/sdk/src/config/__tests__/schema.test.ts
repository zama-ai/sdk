import { describe, expect, test, vi } from "../../test-fixtures";
import { hardhat } from "../../chains";
import { ConfigurationError } from "../../errors";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import { node } from "../../node/config";
import { web } from "../web";
import { createConfig } from "../create";
import type { RelayerConfig } from "../types";

function mockRelayerConfig(relayer: RelayerSDK): RelayerConfig {
  return {
    type: "test",
    createRelayer: vi.fn(() => relayer),
  };
}

describe("createConfig validation", () => {
  test("validates and applies numeric defaults at the public entrypoint", ({
    relayer,
    provider,
  }) => {
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
      keypairTTL: 86400,
      permitTTL: 7,
      registryTTL: 60,
    });

    expect(config.keypairTTL).toBe(86400);
    expect(config.permitTTL).toBe(7);
    expect(config.registryTTL).toBe(60);
  });

  test("rejects invalid TTLs at createConfig", ({ relayer, provider }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        keypairTTL: 0,
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        keypairTTL: 0,
      }),
    ).toThrow("keypairTTL must be a positive integer number of seconds");
  });

  test("rejects invalid keypairTTL even without a signer", ({ relayer, provider }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        keypairTTL: 0,
      }),
    ).toThrow("keypairTTL must be a positive integer number of seconds");
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        keypairTTL: NaN,
      }),
    ).toThrow("keypairTTL must be a positive integer number of seconds");
  });

  test("rejects invalid web transport numeric options at the factory boundary", () => {
    expect(() => web({ threads: 0 })).toThrow(ConfigurationError);
    expect(() => web({ fheArtifactCacheTTL: -1 })).toThrow(ConfigurationError);
  });

  test("rejects invalid node transport numeric options at the factory boundary", () => {
    expect(() => node({ poolSize: 0 })).toThrow(ConfigurationError);
    expect(() => node({ fheArtifactCacheTTL: -1 })).toThrow(ConfigurationError);
  });
});
