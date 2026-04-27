import { describe, expect, it, vi } from "vitest";
import { RelayerDispatcher, type WorkerLike } from "../relayer-dispatcher";
import { ConfigurationError } from "../../errors";
import { createMockRelayer } from "../../test-fixtures";
import type { FheChain } from "../../chains/types";
import type { RelayerConfig } from "../../config/relayers";
import type { RelayerSDK } from "../relayer-sdk";

const chainA: FheChain = { id: 1 } as FheChain;
const chainB: FheChain = { id: 2 } as FheChain;

function makeMockWorker(): WorkerLike {
  return { terminate: vi.fn<() => void>() };
}

/** Create a RelayerConfig that produces a mock relayer (no real worker). */
function mockRelayerConfig(overrides?: Partial<RelayerSDK>): RelayerConfig {
  return {
    type: "web",
    createRelayer: () => createMockRelayer(overrides) as unknown as RelayerSDK,
  };
}

/** Create a RelayerConfig with a real mock worker. */
function mockRelayerConfigWithWorker(worker: WorkerLike): RelayerConfig {
  return {
    type: "web",
    createWorker: () => worker,
    createRelayer: () => createMockRelayer() as unknown as RelayerSDK,
  };
}

function makeDispatcher(chains: FheChain[], relayerConfigs?: Record<number, RelayerConfig>) {
  const configs =
    relayerConfigs ?? Object.fromEntries(chains.map((c) => [c.id, mockRelayerConfig()]));
  return new RelayerDispatcher(chains as [FheChain, ...FheChain[]], configs);
}

describe("RelayerDispatcher", () => {
  describe("constructor", () => {
    it("throws ConfigurationError on empty chains", () => {
      expect(() => new RelayerDispatcher([] as any, {})).toThrow(ConfigurationError);
    });

    it("throws ConfigurationError when chain has no matching relayer config", () => {
      expect(() => new RelayerDispatcher([chainA, chainB], { [1]: mockRelayerConfig() })).toThrow(
        "Chain 2 has no relayer configured",
      );
    });
  });

  describe("chains / activeChain", () => {
    it("exposes configured chains", () => {
      const dispatcher = makeDispatcher([chainA, chainB]);
      expect(dispatcher.chains).toEqual([chainA, chainB]);
    });

    it("defaults to first chain", () => {
      const dispatcher = makeDispatcher([chainA, chainB]);
      expect(dispatcher.chain).toBe(chainA);
    });

    it("returns active chain after switchChain", () => {
      const dispatcher = makeDispatcher([chainA, chainB]);
      dispatcher.switchChain(2);
      expect(dispatcher.chain).toBe(chainB);
    });
  });

  describe("switchChain", () => {
    it("switches the active chain", () => {
      const dispatcher = makeDispatcher([chainA, chainB]);
      dispatcher.switchChain(2);
      expect(dispatcher.chain).toBe(chainB);
    });

    it("throws ConfigurationError on unknown chainId", () => {
      const dispatcher = makeDispatcher([chainA]);
      expect(() => dispatcher.switchChain(999)).toThrow(ConfigurationError);
    });
  });

  describe("delegation to active relayer", () => {
    it("delegates operations to the active chain relayer", async () => {
      const relayerA = createMockRelayer() as unknown as RelayerSDK;
      const relayerB = createMockRelayer() as unknown as RelayerSDK;
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });

      await dispatcher.encrypt({ values: [] } as any);
      expect(relayerA.encrypt).toHaveBeenCalled();
      expect(relayerB.encrypt).not.toHaveBeenCalled();
    });

    it("delegates to switched relayer after switchChain", async () => {
      const relayerA = createMockRelayer() as unknown as RelayerSDK;
      const relayerB = createMockRelayer() as unknown as RelayerSDK;
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
    it.each([
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
      async (method, args) => {
        const relayer = createMockRelayer() as unknown as RelayerSDK;
        const dispatcher = new RelayerDispatcher([chainA], {
          [1]: { type: "web", createRelayer: () => relayer },
        });
        await (dispatcher[method] as Function)(...args);
        expect(relayer[method]).toHaveBeenCalled();
      },
    );
  });

  describe("terminate()", () => {
    it("terminates workers created by relayer configs", () => {
      const worker = makeMockWorker();
      const dispatcher = new RelayerDispatcher([chainA], {
        [1]: mockRelayerConfigWithWorker(worker),
      });
      dispatcher.terminate();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it("terminates all workers from multiple groups", () => {
      const w1 = makeMockWorker();
      const w2 = makeMockWorker();
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: mockRelayerConfigWithWorker(w1),
        [2]: mockRelayerConfigWithWorker(w2),
      });
      dispatcher.terminate();
      expect(w1.terminate).toHaveBeenCalledTimes(1);
      expect(w2.terminate).toHaveBeenCalledTimes(1);
    });

    it("cleans up relayer caches (deduped)", () => {
      const shared = createMockRelayer() as unknown as RelayerSDK;
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

    it("cleans up distinct relayers separately", () => {
      const relayerA = createMockRelayer() as unknown as RelayerSDK;
      const relayerB = createMockRelayer() as unknown as RelayerSDK;
      const dispatcher = new RelayerDispatcher([chainA, chainB], {
        [1]: { type: "web", createRelayer: () => relayerA },
        [2]: { type: "web", createRelayer: () => relayerB },
      });
      dispatcher.terminate();
      expect(relayerA.terminate).toHaveBeenCalledTimes(1);
      expect(relayerB.terminate).toHaveBeenCalledTimes(1);
    });

    it("collects errors from both relayers and workers", () => {
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
            }) as unknown as RelayerSDK,
        },
      });
      expect(() => dispatcher.terminate()).toThrow("Failed to terminate relayer resources");
    });

    it("is safe when no workers are created", () => {
      const dispatcher = makeDispatcher([chainA]);
      expect(() => dispatcher.terminate()).not.toThrow();
    });
  });

  describe("[Symbol.dispose]", () => {
    it("terminates workers and cleans up relayers", () => {
      const worker = makeMockWorker();
      const relayer = createMockRelayer() as unknown as RelayerSDK;
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
