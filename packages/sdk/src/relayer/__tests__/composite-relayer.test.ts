import { describe, expect, it, vi } from "vitest";
import { CompositeRelayer } from "../composite-relayer";
import { ConfigurationError } from "../../errors";
import { createMockRelayer } from "../../test-fixtures";
import type { ResolvedChainTransport } from "../../config/resolve";
import type { RelayerSDK } from "../relayer-sdk";
import type { TransportConfig } from "../../config/transports";

/** Create a transport config with a mock createRelayer that returns the given relayer. */
function mockTransport(relayer: ReturnType<typeof createMockRelayer>): TransportConfig {
  return {
    type: "web",
    createRelayer: () => relayer as unknown as RelayerSDK,
  } as TransportConfig;
}

/**
 * Build a CompositeRelayer that lazily resolves to the given mock relayers.
 */
function makeComposite(
  chainRelayers: Record<number, ReturnType<typeof createMockRelayer>>,
  activeChainId = Object.keys(chainRelayers).map(Number)[0] ?? 1,
) {
  const configs = new Map<number, ResolvedChainTransport>();
  for (const id of Object.keys(chainRelayers).map(Number)) {
    configs.set(id, {
      chain: { chainId: id } as ResolvedChainTransport["chain"],
      transport: mockTransport(chainRelayers[id]),
    });
  }

  const resolveChainId = vi.fn().mockResolvedValue(activeChainId);
  return { composite: new CompositeRelayer(resolveChainId, configs), resolveChainId };
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
      const configs = new Map<number, ResolvedChainTransport>();
      const resolveChainId = vi.fn().mockRejectedValue(new Error("wallet disconnected"));
      const composite = new CompositeRelayer(resolveChainId, configs);

      await expect(composite.encrypt({ values: [] } as any)).rejects.toThrow(ConfigurationError);
      await expect(composite.encrypt({ values: [] } as any)).rejects.toThrow(
        "Failed to resolve the current chain ID",
      );
    });
  });

  describe("terminate()", () => {
    it("terminates all unique relayers", async () => {
      const relayer = createMockRelayer();
      const { composite, resolveChainId } = makeComposite({ 1: relayer, 2: relayer }, 1);

      await composite.getAclAddress();
      resolveChainId.mockResolvedValue(2);
      await composite.getAclAddress();

      composite.terminate();
      expect(relayer.terminate).toHaveBeenCalledTimes(1);
    });

    it("terminates distinct relayers separately", async () => {
      const relayerA = createMockRelayer();
      const relayerB = createMockRelayer();
      const { composite, resolveChainId } = makeComposite({ 1: relayerA, 2: relayerB }, 1);

      await composite.getAclAddress();
      resolveChainId.mockResolvedValue(2);
      await composite.getAclAddress();

      composite.terminate();
      expect(relayerA.terminate).toHaveBeenCalledTimes(1);
      expect(relayerB.terminate).toHaveBeenCalledTimes(1);
    });

    it("collects errors and throws AggregateError", async () => {
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
      const { composite, resolveChainId } = makeComposite({ 1: relayerA, 2: relayerB }, 1);

      await composite.getAclAddress();
      resolveChainId.mockResolvedValue(2);
      await composite.getAclAddress();

      expect(() => composite.terminate()).toThrow("One or more relayers failed to terminate");
      expect(relayerA.terminate).toHaveBeenCalled();
      expect(relayerB.terminate).toHaveBeenCalled();
    });

    it("terminates remaining relayers even if one throws", async () => {
      const relayerA = createMockRelayer({
        terminate: vi.fn(() => {
          throw new Error("fail");
        }),
      });
      const relayerB = createMockRelayer();
      const { composite, resolveChainId } = makeComposite({ 1: relayerA, 2: relayerB }, 1);

      await composite.getAclAddress();
      resolveChainId.mockResolvedValue(2);
      await composite.getAclAddress();

      expect(() => composite.terminate()).toThrow("One or more relayers failed to terminate");
      expect(relayerB.terminate).toHaveBeenCalledTimes(1);
    });
  });

  describe("defensive copy", () => {
    it("is not affected by external map mutations after construction", async () => {
      const relayer = createMockRelayer();
      const configs = new Map<number, ResolvedChainTransport>([
        [
          1,
          {
            chain: { chainId: 1 } as ResolvedChainTransport["chain"],
            transport: mockTransport(relayer),
          },
        ],
      ]);
      const resolveChainId = vi.fn().mockResolvedValue(1);
      const composite = new CompositeRelayer(resolveChainId, configs);

      configs.delete(1);

      await expect(composite.getAclAddress()).resolves.toBeDefined();
    });
  });
});
