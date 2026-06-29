import { describe, expect, test } from "../../test-fixtures";
import { ChainRouter } from "../../chains/router";
import { ConfigurationError } from "../../errors";
import type { FheChain } from "../../chains/types";
import type { RelayerConfig } from "../../config/types";
import type { RelayerSDK } from "../../relayer/types";

describe("ChainRouter", () => {
  describe("constructor", () => {
    test("throws ConfigurationError on empty chains", () => {
      expect(() => new ChainRouter([] as any, {})).toThrow(ConfigurationError);
    });

    test("throws ConfigurationError when chain has no matching relayer config", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      expect(
        () =>
          new ChainRouter([chainA, chainB], {
            [1]: { type: "web", createRelayer: () => createMockRelayer() },
          }),
      ).toThrow("Chain 2 has no relayer configured");
    });
  });

  describe("chains / chain", () => {
    test("exposes configured chains", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      expect(router.chains).toEqual([chainA, chainB]);
    });

    test("defaults to first chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      expect(router.chain).toEqual(chainA);
    });

    test("returns active chain after switchChain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      router.switchChain(2);
      expect(router.chain).toEqual(chainB);
    });
  });

  describe("switchChain", () => {
    test("switches the active chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      router.switchChain(2);
      expect(router.chain).toEqual(chainB);
    });

    test("throws ConfigurationError on unknown chainId", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const router = new ChainRouter([chainA], relayerConfigs([chainA], createMockRelayer));
      expect(() => router.switchChain(999)).toThrow(ConfigurationError);
    });
  });

  describe("active backend (router.relayer)", () => {
    test("returns the backend for the active chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const router = new ChainRouter([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });
      expect(router.relayer).toBe(relayerA);
    });

    test("routes to the switched chain's backend after switchChain", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const router = new ChainRouter([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });
      router.switchChain(2);
      expect(router.relayer).toBe(relayerB);
    });
  });
});

/** Build a default `Record<number, RelayerConfig>` keyed by each chain's id. */
function relayerConfigs(
  chains: FheChain[],
  createRelayer: () => RelayerSDK,
): Record<number, RelayerConfig> {
  return Object.fromEntries(chains.map((c) => [c.id, { type: "web", createRelayer }]));
}
