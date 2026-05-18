import { describe, expect, test, vi } from "../../test-fixtures";
import { RelayerDispatcher, type WorkerLike } from "../relayer-dispatcher";
import { ConfigurationError } from "../../errors";
import type { FheChain } from "../../chains/types";
import type { RelayerConfig } from "../../config/types";
import type { RelayerSDK } from "../relayer-sdk";

function makeMockWorker(): WorkerLike {
  return { terminate: vi.fn<() => void>() };
}

describe("RelayerDispatcher", () => {
  describe("constructor", () => {
    test("throws ConfigurationError on empty chains", () => {
      expect(() => new RelayerDispatcher([] as any, {})).toThrow(ConfigurationError);
    });

    test("throws ConfigurationError when chain has no matching relayer config", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      expect(
        () =>
          new RelayerDispatcher([chainA, chainB], {
            [1]: {
              type: "web",
              createRelayer: () => createMockRelayer(),
            },
          }),
      ).toThrow("Chain 2 has no relayer configured");
    });
  });

  describe("chains / activeChain", () => {
    test("exposes configured chains", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const dispatcher = new RelayerDispatcher(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      expect(dispatcher.chains).toEqual([chainA, chainB]);
    });

    test("defaults to first chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const dispatcher = new RelayerDispatcher(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      expect(dispatcher.chain).toEqual(chainA);
    });

    test("returns active chain after switchChain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const dispatcher = new RelayerDispatcher(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      dispatcher.switchChain(2);
      expect(dispatcher.chain).toEqual(chainB);
    });
  });

  describe("switchChain", () => {
    test("switches the active chain", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const dispatcher = new RelayerDispatcher(
        [chainA, chainB],
        relayerConfigs([chainA, chainB], createMockRelayer),
      );
      dispatcher.switchChain(2);
      expect(dispatcher.chain).toEqual(chainB);
    });

    test("throws ConfigurationError on unknown chainId", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const dispatcher = new RelayerDispatcher(
        [chainA],
        relayerConfigs([chainA], createMockRelayer),
      );
      expect(() => dispatcher.switchChain(999)).toThrow(ConfigurationError);
    });
  });

  describe("delegation to active relayer", () => {
    test("delegates operations to the active chain relayer", async ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });

      await dispatcher.encrypt({ values: [] } as any);
      expect(relayerA.encrypt).toHaveBeenCalled();
      expect(relayerB.encrypt).not.toHaveBeenCalled();
    });

    test("delegates to switched relayer after switchChain", async ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });

      dispatcher.switchChain(2);
      await dispatcher.encrypt({ values: [] } as any);
      expect(relayerB.encrypt).toHaveBeenCalled();
      expect(relayerA.encrypt).not.toHaveBeenCalled();
    });
  });

  describe("dispatches all RelayerSDK methods", () => {
    test.for([
      ["generateKeypair", []],
      ["createEIP712", ["0xpubkey", ["0xcontract"], 1000]],
      ["encrypt", [{ values: [] }]],
      ["userDecrypt", [{ handles: [] }]],
      ["publicDecrypt", [["0xhandle"]]],
      ["createDelegatedUserDecryptEIP712", ["0xpubkey", ["0xcontract"], "0xdelegator", 1000]],
      ["delegatedUserDecrypt", [{ handles: [] }]],
      ["requestZKProofVerification", [{ proof: "0x" }]],
      ["getPublicKey", []],
      ["getPublicParams", [2048]],
      ["getAclAddress", []],
    ] as [keyof RelayerSDK, unknown[]][])(
      "forwards %s to the active relayer",
      async ([method, args], { createMockChain, createMockRelayer }) => {
        const chainA = createMockChain({ id: 1 });
        const relayer = createMockRelayer();
        const dispatcher = new RelayerDispatcher([chainA], {
          [1]: { type: "web", createRelayer: () => relayer },
        });
        await (dispatcher[method] as Function)(...args);
        expect(relayer[method]).toHaveBeenCalled();
      },
    );
  });

  describe("terminate()", () => {
    test("terminates workers created by relayer configs", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const worker = makeMockWorker();
      const dispatcher = new RelayerDispatcher([chainA], {
        [1]: {
          type: "web",
          createWorker: () => worker,
          createRelayer: () => createMockRelayer(),
        },
      });
      dispatcher.terminate();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    test("terminates all workers from multiple groups", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const w1 = makeMockWorker();
      const w2 = makeMockWorker();
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: {
          type: "web",
          createWorker: () => w1,
          createRelayer: () => createMockRelayer(),
        },
        [2]: {
          type: "web",
          createWorker: () => w2,
          createRelayer: () => createMockRelayer(),
        },
      });
      dispatcher.terminate();
      expect(w1.terminate).toHaveBeenCalledTimes(1);
      expect(w2.terminate).toHaveBeenCalledTimes(1);
    });

    test("cleans up relayer caches (deduped)", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const shared = createMockRelayer();
      // Same config object → same group → one worker, one createRelayer call per chain but same mock
      const sharedConfig: RelayerConfig = {
        type: "web",
        createRelayer: () => shared,
      };
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: sharedConfig,
        [2]: sharedConfig,
      });
      dispatcher.terminate();
      // shared relayer returned for both chains, but Set dedupes
      expect(shared.terminate).toHaveBeenCalledTimes(1);
    });

    test("cleans up distinct relayers separately", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const chainB = createMockChain({ id: 2 });
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });
      dispatcher.terminate();
      expect(relayerA.terminate).toHaveBeenCalledTimes(1);
      expect(relayerB.terminate).toHaveBeenCalledTimes(1);
    });

    test("collects errors from both relayers and workers", ({
      createMockChain,
      createMockRelayer,
    }) => {
      const chainA = createMockChain({ id: 1 });
      const failWorker: WorkerLike = {
        terminate: vi.fn(() => {
          throw new Error("worker fail");
        }),
      };
      const dispatcher = new RelayerDispatcher([chainA], {
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
      expect(() => dispatcher.terminate()).toThrow("Failed to terminate relayer resources");
    });

    test("is safe when no workers are created", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const dispatcher = new RelayerDispatcher(
        [chainA],
        relayerConfigs([chainA], createMockRelayer),
      );
      expect(() => dispatcher.terminate()).not.toThrow();
    });
  });

  describe("[Symbol.dispose]", () => {
    test("terminates workers and cleans up relayers", ({ createMockChain, createMockRelayer }) => {
      const chainA = createMockChain({ id: 1 });
      const worker = makeMockWorker();
      const relayer = createMockRelayer();
      const dispatcher = new RelayerDispatcher([chainA], {
        [1]: {
          type: "web",
          createWorker: () => worker,
          createRelayer: () => relayer,
        },
      });
      dispatcher[Symbol.dispose]();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(relayer.terminate).toHaveBeenCalledTimes(1);
    });
  });
});

/** Build a default `Record<number, RelayerConfig>` keyed by each chain's id. */
function relayerConfigs(
  chains: FheChain[],
  createRelayer: () => RelayerSDK,
): Record<number, RelayerConfig> {
  return Object.fromEntries(
    chains.map((c) => [
      c.id,
      {
        type: "web",
        createRelayer,
      },
    ]),
  );
}
