import { describe, expect, test, vi } from "../../test-fixtures";
import { hardhat } from "../../chains";
import type { RelayerSDK } from "../../relayer/relayer-sdk";
import type { GenericLogger } from "../../worker/worker.types";
import { createConfig } from "../create";
import type { RelayerConfig, ZamaConfigGeneric } from "../types";

function mockRelayerConfig(relayer: RelayerSDK): RelayerConfig {
  return { type: "test", createRelayer: vi.fn(() => relayer) };
}

function mockLogger(): GenericLogger {
  return { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
}

// Old keys have no index signature on ZamaConfigGeneric, so a direct object
// literal with one is a compile error (TS2353) — the case this guard can't
// catch. Assembling via a spread + cast mirrors the silent-drop path the
// guard exists for: config built from a variable, excess-property check
// never runs, and the stale key would otherwise vanish with no signal.
function buildParamsWithStaleKey(
  oldKey: string,
  relayer: RelayerSDK,
  provider: unknown,
  logger: GenericLogger,
): ZamaConfigGeneric<[typeof hardhat]> {
  const base = {
    chains: [hardhat],
    relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
    provider,
    logger,
    [oldKey]: "stale-value",
  };
  return base as unknown as ZamaConfigGeneric<[typeof hardhat]>;
}

describe("buildZamaConfig — renamed config key guard", () => {
  test("warns when 'sessionStorage' is present, pointing to 'permitStorage'", ({
    relayer,
    provider,
  }) => {
    const logger = mockLogger();
    createConfig(buildParamsWithStaleKey("sessionStorage", relayer, provider, logger));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/sessionStorage.*permitStorage/),
      undefined,
    );
  });

  test("warns when 'sessionTTL' is present, pointing to 'permitTTL'", ({ relayer, provider }) => {
    const logger = mockLogger();
    createConfig(buildParamsWithStaleKey("sessionTTL", relayer, provider, logger));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/sessionTTL.*permitTTL/),
      undefined,
    );
  });

  test("warns when 'keypairTTL' is present, pointing to 'transportKeyPairTTL'", ({
    relayer,
    provider,
  }) => {
    const logger = mockLogger();
    createConfig(buildParamsWithStaleKey("keypairTTL", relayer, provider, logger));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/keypairTTL.*transportKeyPairTTL/),
      undefined,
    );
  });

  test("does not warn when only current key names are used", ({ relayer, provider }) => {
    const logger = mockLogger();
    createConfig({
      chains: [hardhat],
      relayers: { [hardhat.id]: mockRelayerConfig(relayer) },
      provider,
      logger,
      permitTTL: 7,
      transportKeyPairTTL: 86400,
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
