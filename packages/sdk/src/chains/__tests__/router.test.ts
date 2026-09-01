import { describe, expect, test } from "../../test-fixtures";
import { ChainRouter } from "../../chains/router";
import { ConfigurationError } from "../../errors";
import type { FheChain } from "../../chains/types";
import type { RelayerConfig } from "../../config/types";
import type { RelayerSDK } from "../../relayer/types";
import { LoggerService } from "../../services/logger-service";

describe("ChainRouter", () => {
  describe("constructor", () => {
    test("throws ConfigurationError on empty chains", () => {
      expect(() => new ChainRouter([] as any, {}, new LoggerService())).toThrow(ConfigurationError);
    });

    test("throws ConfigurationError when chain has no matching relayer config", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      expect(
        () =>
          new ChainRouter(
            [chainA, chainB],
            { [1]: { type: "web", createRelayer: () => createMockRelayer() } },
            new LoggerService(),
          ),
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
        new LoggerService(),
      );
      expect(router.chains).toEqual([chainA, chainB]);
    });

    test("defaults to first chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
        new LoggerService(),
      );
      expect(router.chain).toEqual(chainA);
    });

    test("returns active chain after switchChain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
        new LoggerService(),
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
        new LoggerService(),
      );
      router.switchChain(2);
      expect(router.chain).toEqual(chainB);
    });

    test("tracks an unconfigured chain instead of staying on the old one", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const router = new ChainRouter(
        [chainA],
        relayerConfigs([chainA], createMockRelayer),
        new LoggerService(),
      );
      // The active chain follows the wallet even when unconfigured; the failure
      // surfaces loudly at the next getter, not silently on the old chain. Both
      // getters report the chain error, since `relayer` resolves `chain` first.
      expect(() => router.switchChain(999)).not.toThrow();
      expect(() => router.chain).toThrow(ConfigurationError);
      expect(() => router.chain).toThrow("Chain 999 is not configured");
      expect(() => router.relayer).toThrow(ConfigurationError);
      expect(() => router.relayer).toThrow("Chain 999 is not configured");
    });

    test("restores service after switching back to a configured chain", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const router = new ChainRouter(
        [chainA],
        relayerConfigs([chainA], createMockRelayer),
        new LoggerService(),
      );
      router.switchChain(999);
      router.switchChain(1);
      expect(router.chain).toEqual(chainA);
    });
  });

  describe("active backend (router.relayer)", () => {
    test("returns the backend for the active chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const router = new ChainRouter(
        [chainA, chainB],
        {
          [1]: { type: "web", createRelayer: () => relayerA },
          [2]: { type: "web", createRelayer: () => relayerB },
        },
        new LoggerService(),
      );
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
      const router = new ChainRouter(
        [chainA, chainB],
        {
          [1]: { type: "web", createRelayer: () => relayerA },
          [2]: { type: "web", createRelayer: () => relayerB },
        },
        new LoggerService(),
      );
      router.switchChain(2);
      expect(router.relayer).toBe(relayerB);
    });

    test("throws its own ConfigurationError when a configured chain has no backend", ({
      createMockChain,
      createMockRelayer,
    }) => {
      // Construction keeps chains and relayers in lockstep, so the relayer
      // getter's guard — distinct from the chain getter's — is only reachable
      // when the active chain resolves but its backend is absent. Force that by
      // reporting an active chain whose id has no configured relayer.
      const chainA = createMockChain({ id: 1 });
      class BackendlessRouter extends ChainRouter {
        override get chain(): FheChain {
          return createMockChain({ id: 424242 });
        }
      }
      const router = new BackendlessRouter(
        [chainA],
        relayerConfigs([chainA], createMockRelayer),
        new LoggerService(),
      );
      expect(() => router.relayer).toThrow(ConfigurationError);
      expect(() => router.relayer).toThrow(
        "No relayer configured for chain 1. Add it to the relayers object.",
      );
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
