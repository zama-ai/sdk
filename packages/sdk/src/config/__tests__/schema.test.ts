import { describe, expect, test, vi } from "../../test-fixtures";
import { hardhat } from "../../chains";
import { ConfigurationError } from "../../errors";
import type { RelayerSDK } from "../../relayer/types";
import { createConfig } from "../create";
import { LoggerService } from "../../services/logger-service";
import type { RelayerConfig } from "../types";
import { ZamaSDK } from "../../zama-sdk";

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

  test("rejects a permitTTL above the V1 permit maximum of 365 days at createConfig", ({
    relayer,
    provider,
  }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        permitTTL: 366,
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        permitTTL: 366,
      }),
    ).toThrow("permitTTL must not exceed the V1 permit maximum of 365 days");
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

  test("rejects an empty transportKeyPairScope at createConfig", ({ relayer, provider }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairScope: "",
      }),
    ).toThrow(ConfigurationError);
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairScope: "",
      }),
    ).toThrow("transportKeyPairScope must be a non-empty string");
  });

  test("resolves transportKeyPairScope to undefined when omitted, preserving the default per-signer behavior", ({
    relayer,
    provider,
  }) => {
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
    });

    expect(config.transportKeyPairScope).toBeUndefined();
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

  test("stays quiet when a second createConfig call carries no runtime options", ({
    relayer,
    provider,
  }) => {
    const sink = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };

    createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
      logger: sink,
    });
    createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
      logger: sink,
      signer: undefined,
    });

    expect(sink.warn).not.toHaveBeenCalled();
  });
});

describe("ZamaSDK config plumbing", () => {
  test("accepts the exact object returned by createConfig", ({ relayer, provider }) => {
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
    });

    expect(() => new ZamaSDK(config)).not.toThrow();
  });

  test("accepts a spread copy of a resolved config, since config is plain data with no hidden state", ({
    relayer,
    provider,
    signer,
  }) => {
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
    });

    expect(() => new ZamaSDK({ ...config, signer })).not.toThrow();
  });
});
