import { describe, expect, test, vi } from "../../test-fixtures";
import { hardhat } from "../../chains";
import { ConfigurationError } from "../../errors";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import { node } from "../../node/config";
import { web } from "../web";
import { createConfig } from "../create";
import { LoggerService } from "../../services/logger-service";
import type { RelayerConfig } from "../types";

function mockRelayerConfig(relayer: RelayerSDK): RelayerConfig {
  return { type: "test", createRelayer: vi.fn(() => relayer) };
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
      transportKeyPairTTL: 86400,
      permitTTL: 7,
      registryTTL: 60,
    });

    expect(config.transportKeyPairTTL).toBe(86400);
    expect(config.permitTTL).toBe(7);
    expect(config.registryTTL).toBe(60);
  });

  test("rejects invalid TTLs at createConfig", ({ relayer, provider }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairTTL: 0,
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairTTL: 0,
      }),
    ).toThrow("transportKeyPairTTL must be a positive integer number of seconds");
  });

  test("rejects invalid transportKeyPairTTL even without a signer", ({ relayer, provider }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairTTL: 0,
      }),
    ).toThrow("transportKeyPairTTL must be a positive integer number of seconds");
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairTTL: NaN,
      }),
    ).toThrow("transportKeyPairTTL must be a positive integer number of seconds");
  });

  test("wraps a supplied logger into a LoggerService on the resolved config", ({
    relayer,
    provider,
  }) => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

    const withLogger = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
      logger: sink,
    });
    expect(withLogger.logger).toBeInstanceOf(LoggerService);
    withLogger.logger.warn("hello");
    expect(sink.warn).toHaveBeenCalledWith("[zama-sdk] hello", undefined);
  });

  test("always exposes a silent LoggerService when no logger is configured", ({
    relayer,
    provider,
  }) => {
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
    });
    expect(config.logger).toBeInstanceOf(LoggerService);
    expect(() => config.logger.debug("noop")).not.toThrow();
  });

  test("passes the SDK-wide LoggerService to a relayer's createWorker", ({ relayer, provider }) => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
    const createWorker = vi.fn(() => ({ terminate: vi.fn() }));
    const relayerConfig: RelayerConfig = {
      type: "test",
      createWorker,
      createRelayer: vi.fn(() => relayer),
    };

    createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: relayerConfig },
      provider,
      logger: sink,
    });

    expect(createWorker).toHaveBeenCalledWith([hardhat], expect.any(LoggerService));
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
