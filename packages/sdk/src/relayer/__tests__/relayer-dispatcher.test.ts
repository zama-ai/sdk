import { describe, expect, it, vi } from "vitest";
import { RelayerDispatcher, type WorkerLike } from "../relayer-dispatcher";
import { ConfigurationError } from "../../errors";
import { createMockRelayer } from "../../test-fixtures";
import type { FheChain } from "../../chains/types";
import type { RelayerSDK } from "../relayer-sdk";

const chainA: FheChain = { id: 1 } as FheChain;
const chainB: FheChain = { id: 2 } as FheChain;

function makeMockWorker() {
  return { terminate: vi.fn<() => void>() };
}

function makeDispatcher(
  chains: FheChain[],
  relayerMap?: Map<number, RelayerSDK>,
  workers?: WorkerLike[],
) {
  const relayers =
    relayerMap ??
    new Map<number, RelayerSDK>(
      chains.map((c) => [c.id, createMockRelayer() as unknown as RelayerSDK]),
    );
  const chainMap = new Map(chains.map((c) => [c.id, c]));
  return {
    dispatcher: new RelayerDispatcher(chainMap, relayers, workers),
    relayers,
  };
}

describe("RelayerDispatcher", () => {
  describe("constructor", () => {
    it("throws ConfigurationError on empty chains", () => {
      expect(() => new RelayerDispatcher(new Map(), new Map())).toThrow(ConfigurationError);
    });
  });

  describe("chains / activeChain", () => {
    it("exposes configured chains", () => {
      const { dispatcher } = makeDispatcher([chainA, chainB]);
      expect(dispatcher.chains).toEqual([chainA, chainB]);
    });

    it("throws before switchChain is called", () => {
      const { dispatcher } = makeDispatcher([chainA, chainB]);
      expect(() => dispatcher.chain).toThrow("No active chain");
    });

    it("returns active chain after switchChain", () => {
      const { dispatcher } = makeDispatcher([chainA, chainB]);
      dispatcher.switchChain(1);
      expect(dispatcher.chain).toBe(chainA);
    });
  });

  describe("switchChain", () => {
    it("switches the active chain", () => {
      const { dispatcher } = makeDispatcher([chainA, chainB]);
      dispatcher.switchChain(2);
      expect(dispatcher.chain).toBe(chainB);
    });

    it("throws ConfigurationError on unknown chainId", () => {
      const { dispatcher } = makeDispatcher([chainA]);
      expect(() => dispatcher.switchChain(999)).toThrow(ConfigurationError);
    });
  });

  describe("delegation to active relayer", () => {
    it("delegates operations to the active chain relayer", async () => {
      const relayerA = createMockRelayer() as unknown as RelayerSDK;
      const relayerB = createMockRelayer() as unknown as RelayerSDK;
      const relayers = new Map<number, RelayerSDK>([
        [1, relayerA],
        [2, relayerB],
      ]);
      const dispatcher = new RelayerDispatcher(
        new Map([
          [1, chainA],
          [2, chainB],
        ]),
        relayers,
      );

      dispatcher.switchChain(1);
      await dispatcher.encrypt({ values: [] } as any);
      expect(relayerA.encrypt).toHaveBeenCalled();
      expect(relayerB.encrypt).not.toHaveBeenCalled();
    });

    it("delegates to switched relayer after switchChain", async () => {
      const relayerA = createMockRelayer() as unknown as RelayerSDK;
      const relayerB = createMockRelayer() as unknown as RelayerSDK;
      const relayers = new Map<number, RelayerSDK>([
        [1, relayerA],
        [2, relayerB],
      ]);
      const dispatcher = new RelayerDispatcher(
        new Map([
          [1, chainA],
          [2, chainB],
        ]),
        relayers,
      );

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
        const relayers = new Map<number, RelayerSDK>([[1, relayer]]);
        const dispatcher = new RelayerDispatcher(new Map([[1, chainA]]), relayers);
        dispatcher.switchChain(1);
        await (dispatcher[method] as Function)(...args);
        expect(relayer[method]).toHaveBeenCalled();
      },
    );
  });

  describe("terminate()", () => {
    it("terminates workers passed to the constructor", () => {
      const worker = makeMockWorker();
      const { dispatcher } = makeDispatcher([chainA], undefined, [worker]);
      dispatcher.terminate();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
    });

    it("terminates all workers even when multiple are provided", () => {
      const w1 = makeMockWorker();
      const w2 = makeMockWorker();
      const { dispatcher } = makeDispatcher([chainA, chainB], undefined, [w1, w2]);
      dispatcher.terminate();
      expect(w1.terminate).toHaveBeenCalledTimes(1);
      expect(w2.terminate).toHaveBeenCalledTimes(1);
    });

    it("cleans up relayer caches (deduped)", () => {
      const shared = createMockRelayer() as unknown as RelayerSDK;
      const relayers = new Map<number, RelayerSDK>([
        [1, shared],
        [2, shared],
      ]);
      const dispatcher = new RelayerDispatcher(
        new Map([
          [1, chainA],
          [2, chainB],
        ]),
        relayers,
      );
      dispatcher.terminate();
      expect(shared.terminate).toHaveBeenCalledTimes(1);
    });

    it("cleans up distinct relayers separately", () => {
      const relayerA = createMockRelayer() as unknown as RelayerSDK;
      const relayerB = createMockRelayer() as unknown as RelayerSDK;
      const relayers = new Map<number, RelayerSDK>([
        [1, relayerA],
        [2, relayerB],
      ]);
      const dispatcher = new RelayerDispatcher(
        new Map([
          [1, chainA],
          [2, chainB],
        ]),
        relayers,
      );
      dispatcher.terminate();
      expect(relayerA.terminate).toHaveBeenCalledTimes(1);
      expect(relayerB.terminate).toHaveBeenCalledTimes(1);
    });

    it("collects errors from both relayers and workers", () => {
      const relayer = createMockRelayer({
        terminate: vi.fn(() => {
          throw new Error("relayer fail");
        }),
      }) as unknown as RelayerSDK;
      const worker = {
        terminate: vi.fn(() => {
          throw new Error("worker fail");
        }),
      };
      const relayers = new Map<number, RelayerSDK>([[1, relayer]]);
      const dispatcher = new RelayerDispatcher(new Map([[1, chainA]]), relayers, [worker]);
      expect(() => dispatcher.terminate()).toThrow("Failed to terminate relayer resources");
    });

    it("is safe when no workers are provided", () => {
      const { dispatcher } = makeDispatcher([chainA]);
      expect(() => dispatcher.terminate()).not.toThrow();
    });
  });

  describe("[Symbol.dispose]", () => {
    it("terminates workers and cleans up relayers", () => {
      const worker = makeMockWorker();
      const relayer = createMockRelayer() as unknown as RelayerSDK;
      const relayers = new Map<number, RelayerSDK>([[1, relayer]]);
      const dispatcher = new RelayerDispatcher(new Map([[1, chainA]]), relayers, [worker]);
      dispatcher[Symbol.dispose]();
      expect(worker.terminate).toHaveBeenCalledTimes(1);
      expect(relayer.terminate).toHaveBeenCalledTimes(1);
    });
  });
});
