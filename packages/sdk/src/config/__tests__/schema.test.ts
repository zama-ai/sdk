import {
  describe,
  expect,
  it,
  vi,
  createMockProvider,
  createMockRelayer,
} from "../../test-fixtures";
import { hardhat } from "../../chains";
import { ConfigurationError } from "../../errors";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import { node } from "../../node/config";
import { web } from "../web";
import { createConfig } from "../create";
import type { RelayerConfig } from "../types";

function mockRelayerConfig(): RelayerConfig {
  return {
    type: "test",
    createRelayer: vi.fn(() => createMockRelayer() as unknown as RelayerSDK),
  };
}

describe("createConfig validation", () => {
  it("validates and applies numeric defaults at the public entrypoint", () => {
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig() },
      provider: createMockProvider(),
      keypairTTL: 86400,
      permitTTL: 7,
      registryTTL: 60,
    });

    expect(config.keypairTTL).toBe(86400);
    expect(config.permitTTL).toBe(7);
    expect(config.registryTTL).toBe(60);
  });

  it("rejects invalid TTLs at createConfig", () => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig() },
        provider: createMockProvider(),
        keypairTTL: 0,
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig() },
        provider: createMockProvider(),
        keypairTTL: 0,
      }),
    ).toThrow("keypairTTL must be a positive integer number of seconds");
  });

  it("rejects invalid keypairTTL even without a signer", () => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig() },
        provider: createMockProvider(),
        keypairTTL: 0,
      }),
    ).toThrow("keypairTTL must be a positive integer number of seconds");
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig() },
        provider: createMockProvider(),
        keypairTTL: NaN,
      }),
    ).toThrow("keypairTTL must be a positive integer number of seconds");
  });

  it("rejects invalid web transport numeric options at the factory boundary", () => {
    expect(() => web({ threads: 0 })).toThrow(ConfigurationError);
    expect(() => web({ fheArtifactCacheTTL: -1 })).toThrow(ConfigurationError);
  });

  it("rejects invalid node transport numeric options at the factory boundary", () => {
    expect(() => node({ poolSize: 0 })).toThrow(ConfigurationError);
    expect(() => node({ fheArtifactCacheTTL: -1 })).toThrow(ConfigurationError);
  });
});
