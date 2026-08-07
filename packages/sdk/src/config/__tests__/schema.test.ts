import { describe, expect, test, vi } from "../../test-fixtures";
import { hardhat } from "../../chains";
import { ConfigurationError } from "../../errors";
import type { RelayerSDK } from "../../relayer/types";
import { createConfig } from "../create";
import { resolvedDerivationSecretHolder } from "../private-state";
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

  test("rejects a transportKeyPairDerivationSecret below the 256-bit entropy floor", ({
    relayer,
    provider,
  }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairDerivationSecret: "short",
      }),
    ).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairDerivationSecret: new Uint8Array(16),
      }),
    ).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
  });

  test("rejects a transportKeyPairDerivationSecret one byte below the floor (31 bytes)", ({
    relayer,
    provider,
  }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairDerivationSecret: new Uint8Array(31),
      }),
    ).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairDerivationSecret: "a".repeat(31),
      }),
    ).toThrow(
      /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
    );
  });

  test("rejects a wrong-typed transportKeyPairDerivationSecret with the option-naming guidance, not a generic union error", ({
    relayer,
    provider,
  }) => {
    const rejected = [123, null, { secret: "a".repeat(32) }];

    for (const value of rejected) {
      const build = () =>
        createConfig({
          chains: [hardhat],
          relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
          provider,
          transportKeyPairDerivationSecret: value as unknown as string,
        });

      expect(build).toThrow(ConfigurationError);
      // The union's own default message ("invalid input") names nothing actionable, so the
      // crafted per-member error must survive to the top-level failure.
      expect(build).toThrow(
        /transportKeyPairDerivationSecret must be a string or Uint8Array of at least 32 bytes/,
      );
      expect(build).toThrow(/source it from a CSPRNG or secrets manager/);
    }
  });

  test("accepts a transportKeyPairDerivationSecret exactly at the 256-bit floor (32 bytes)", ({
    relayer,
    provider,
  }) => {
    expect(() =>
      createConfig({
        chains: [hardhat],
        relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
        provider,
        transportKeyPairDerivationSecret: new Uint8Array(32),
      }),
    ).not.toThrow();
  });

  test("never exposes the transportKeyPairDerivationSecret on the resolved config", ({
    relayer,
    provider,
  }) => {
    const secret = new Uint8Array(32).fill(7);
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
      transportKeyPairDerivationSecret: secret,
    });

    // No property at all: not enumerable, not hidden behind a non-enumerable descriptor, not
    // a redacted placeholder. Anything else would travel into provider props and devtools.
    expect(Object.keys(config)).not.toContain("transportKeyPairDerivationSecret");
    expect(Object.getOwnPropertyNames(config)).not.toContain("transportKeyPairDerivationSecret");
    expect("transportKeyPairDerivationSecret" in config).toBe(false);
    expect(Object.values(config)).not.toContain(secret);
    expect(
      JSON.stringify(config, (_key, value: unknown) =>
        value instanceof Uint8Array ? Array.from(value) : value,
      ),
    ).not.toContain("transportKeyPairDerivationSecret");
  });

  test("never mutates the caller's own secret buffer, and imports the HKDF base key once per config", async ({
    relayer,
    provider,
  }) => {
    const callerSecret = new Uint8Array(32).fill(7);
    const config = createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
      transportKeyPairDerivationSecret: callerSecret,
    });

    const secretHolder = resolvedDerivationSecretHolder(config);
    expect(secretHolder).toBeDefined();

    const importSpy = vi.spyOn(crypto.subtle, "importKey");
    const first = await secretHolder!.baseKey();
    expect(await secretHolder!.baseKey()).toBe(first);
    expect(importSpy).toHaveBeenCalledOnce();
    importSpy.mockRestore();

    expect(Array.from(callerSecret).every((byte) => byte === 7)).toBe(true);
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
});
