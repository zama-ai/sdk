import { describe, expect, test, vi } from "../../test-fixtures";
import { ChainRouter, type WorkerLike } from "../chain-router";
import { ConfigurationError } from "../../errors";
import type { FheChain } from "../../chains/types";
import type { RelayerConfig } from "../../config/types";
import type { RelayerSDK } from "../relayer-sdk";

function makeMockWorker(): WorkerLike {
  return { terminate: vi.fn<() => void>() };
}

describe("ChainRouter", () => {
  describe("constructor", () => {
    test("throws ConfigurationError on empty chains", () => {
      expect(() => new ChainRouter([] as any, {})).toThrow(ConfigurationError);
    });

    test("throws ConfigurationError when a chain has no relayer config", ({
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
        configs([chainA, chainB], createMockRelayer),
      );
      expect(router.chains).toEqual([chainA, chainB]);
    });

    test("defaults to first chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        configs([chainA, chainB], createMockRelayer),
      );
      expect(router.chain).toEqual(chainA);
    });

    test("active chain follows switchChain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        configs([chainA, chainB], createMockRelayer),
      );
      router.switchChain(2);
      expect(router.chain).toEqual(chainB);
    });
  });

  describe("active", () => {
    test("returns the per-chain RelayerSDK for the active chain", ({
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

      expect(router.active).toBe(relayerA);
      router.switchChain(2);
      expect(router.active).toBe(relayerB);
    });
  });

  describe("for(chainId)", () => {
    test("returns the per-chain RelayerSDK for the given chainId", ({
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

      expect(router.for(1)).toBe(relayerA);
      expect(router.for(2)).toBe(relayerB);
    });

    test("does not depend on the active chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const router = new ChainRouter([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });
      router.switchChain(2);
      // Active is now B, but for(1) still returns A.
      expect(router.for(1)).toBe(relayerA);
    });

    test("throws ConfigurationError on unknown chainId", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const router = new ChainRouter([chainA], configs([chainA], createMockRelayer));
      expect(() => router.for(999)).toThrow(ConfigurationError);
    });
  });

  describe("switchChain", () => {
    test("switches the active chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const router = new ChainRouter(
        [chainA, chainB],
        configs([chainA, chainB], createMockRelayer),
      );
      router.switchChain(2);
      expect(router.chain).toEqual(chainB);
    });

    test("throws ConfigurationError on unknown chainId", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const router = new ChainRouter([chainA], configs([chainA], createMockRelayer));
      expect(() => router.switchChain(999)).toThrow(ConfigurationError);
    });
  });

  describe("worker grouping", () => {
    test("calls createWorker once per RelayerConfig reference", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const createWorker = vi.fn(() => makeMockWorker());
      const sharedConfig: RelayerConfig = {
        type: "web",
        createWorker,
        createRelayer: () => createMockRelayer(),
      };
      new ChainRouter([chainA, chainB], { [1]: sharedConfig, [2]: sharedConfig });
      expect(createWorker).toHaveBeenCalledTimes(1);
      expect(createWorker).toHaveBeenCalledWith([chainA, chainB]);
    });
  });

  describe("terminate()", () => {
    test("terminates workers created by relayer configs", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const worker = makeMockWorker();
      const router = new ChainRouter([chainA], {
        [1]: {
          type: "web",
          createWorker: () => worker,
          createRelayer: () => createMockRelayer(),
        },
      });
      router.terminate();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    test("deduplicates shared relayers", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const shared = createMockRelayer();
      const sharedConfig: RelayerConfig = { type: "web", createRelayer: () => shared };
      const router = new ChainRouter([chainA, chainB], {
        [1]: sharedConfig,
        [2]: sharedConfig,
      });
      router.terminate();
      expect(shared.terminate).toHaveBeenCalledTimes(1);
    });

    test("aggregates errors from both relayers and workers", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const failWorker: WorkerLike = {
        terminate: vi.fn(() => {
          throw new Error("worker fail");
        }),
      };
      const router = new ChainRouter([chainA], {
        [1]: {
          type: "web",
          createWorker: () => failWorker,
          createRelayer: () =>
            createMockRelayer({
              terminate: vi.fn(() => {
                throw new Error("relayer fail");
              }),
            }),
        },
      });
      expect(() => router.terminate()).toThrow("Failed to terminate relayer resources");
    });
  });

  describe("[Symbol.dispose]", () => {
    test("terminates workers and cleans up relayers", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const worker = makeMockWorker();
      const relayer = createMockRelayer();
      const router = new ChainRouter([chainA], {
        [1]: {
          type: "web",
          createWorker: () => worker,
          createRelayer: () => relayer,
        },
      });
      router[Symbol.dispose]();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(relayer.terminate).toHaveBeenCalledTimes(1);
    });
  });
});

function configs(
  chains: FheChain[],
  createRelayer: () => RelayerSDK,
): Record<number, RelayerConfig> {
  return Object.fromEntries(chains.map((c) => [c.id, { type: "web", createRelayer }]));
}
