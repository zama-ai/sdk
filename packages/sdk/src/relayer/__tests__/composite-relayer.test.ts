import { describe, expect, it, vi } from "vitest";
import { CompositeRelayer } from "../composite-relayer";
import { ConfigurationError } from "../../errors";
import { createMockRelayer } from "../../test-fixtures";

function makeComposite(
  chainRelayers: Record<number, ReturnType<typeof createMockRelayer>>,
  activeChainId = Object.keys(chainRelayers).map(Number)[0] ?? 1,
) {
  const map = new Map(Object.entries(chainRelayers).map(([id, r]) => [Number(id), r]));
  const resolveChainId = vi.fn().mockResolvedValue(activeChainId);
  return { composite: new CompositeRelayer(resolveChainId, map), resolveChainId };
}

describe("CompositeRelayer", () => {
  describe("#current() dispatch", () => {
    it("dispatches to the correct per-chain relayer", async () => {
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const { composite } = makeComposite({ 1: relayerA, 2: relayerB }, 2);

      await composite.encrypt({ values: [] } as any);
      expect(relayerB.encrypt).toHaveBeenCalled();
      expect(relayerA.encrypt).not.toHaveBeenCalled();
    });

    it("throws ConfigurationError for unknown chain ID", async () => {
      const { composite } = makeComposite({ 1: createMockRelayer() }, 999);
      await expect(composite.encrypt({ values: [] } as any)).rejects.toThrow(ConfigurationError);
      await expect(composite.encrypt({ values: [] } as any)).rejects.toThrow(
        "No relayer configured for chain 999",
      );
    });

    it("wraps resolveChainId errors with context", async () => {
      const map = new Map([[1, createMockRelayer()]]);
      const resolveChainId = vi.fn().mockRejectedValue(new Error("wallet disconnected"));
      const composite = new CompositeRelayer(resolveChainId, map);

      await expect(composite.encrypt({ values: [] } as any)).rejects.toThrow(ConfigurationError);
      await expect(composite.encrypt({ values: [] } as any)).rejects.toThrow(
        "Failed to resolve the current chain ID",
      );
    });
  });

  describe("terminate()", () => {
    it("terminates all unique relayers", () => {
      const relayer = createMockRelayer();
      // Same relayer instance for two chains (shared)
      const map = new Map([
        [1, relayer],
        [2, relayer],
      ]);
      const composite = new CompositeRelayer(() => Promise.resolve(1), map);

      composite.terminate();
      expect(relayer.terminate).toHaveBeenCalledTimes(1);
    });

    it("terminates distinct relayers separately", () => {
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const { composite } = makeComposite({ 1: relayerA, 2: relayerB });

      composite.terminate();
      expect(relayerA.terminate).toHaveBeenCalledTimes(1);
      expect(relayerB.terminate).toHaveBeenCalledTimes(1);
    });

    it("collects errors and throws AggregateError", () => {
      const relayerA = createMockRelayer({
        terminate: vi.fn(() => {
          throw new Error("fail A");
        }),
      });
      const relayerB = createMockRelayer({
        terminate: vi.fn(() => {
          throw new Error("fail B");
        }),
      });
      const { composite } = makeComposite({ 1: relayerA, 2: relayerB });

      expect(() => composite.terminate()).toThrow("One or more relayers failed to terminate");
      // Both relayers were still attempted
      expect(relayerA.terminate).toHaveBeenCalled();
      expect(relayerB.terminate).toHaveBeenCalled();
    });

    it("terminates remaining relayers even if one throws", () => {
      const relayerA = createMockRelayer({
        terminate: vi.fn(() => {
          throw new Error("fail");
        }),
      });
      const relayerB = createMockRelayer();
      const { composite } = makeComposite({ 1: relayerA, 2: relayerB });

      expect(() => composite.terminate()).toThrow("One or more relayers failed to terminate");
      expect(relayerB.terminate).toHaveBeenCalledTimes(1);
    });
  });

  describe("defensive copy", () => {
    it("is not affected by external map mutations after construction", async () => {
      const relayer = createMockRelayer();
      const map = new Map([[1, relayer]]);
      const resolveChainId = vi.fn().mockResolvedValue(1);
      const composite = new CompositeRelayer(resolveChainId, map);

      // Mutate the original map
      map.delete(1);

      // Should still work — internal copy is unaffected
      await expect(composite.getAclAddress()).resolves.toBeDefined();
    });
  });
});
