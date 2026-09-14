import { describe, expect, makeLogger, test, vi } from "../../test-fixtures";
import { resolveChainRelayers, resolveStorage } from "../resolve";
import { sepolia, mainnet, hardhat, anvil, type FheChain } from "../../chains";
import type { RelayerConfig } from "../types";
import type { RelayerSDK } from "../../relayer/types";
import { LoggerService } from "../../services/logger-service";

/** Stub the public RelayerConfig seam, no internal-module mocking. */
function mockRelayerConfig(type: RelayerConfig["type"] = "web"): RelayerConfig {
  return { type, createRelayer: () => ({}) as unknown as RelayerSDK };
}

const silent = new LoggerService();

type Case = {
  label: string;
  chains: FheChain[];
  relayers: Record<number, RelayerConfig>;
  expected: string;
};

const missingCases: Case[] = [
  {
    label: "single chain with no relayer entry",
    chains: [sepolia],
    relayers: {},
    expected: "Chain 11155111 has no relayer configured",
  },
  {
    label: "second chain missing a relayer entry",
    chains: [sepolia, { id: 999999 } as FheChain],
    relayers: { [11155111]: mockRelayerConfig() },
    expected: "Chain 999999 has no relayer configured",
  },
];

const orphanCases: Case[] = [
  {
    label: "single orphaned key",
    chains: [],
    relayers: { [999]: mockRelayerConfig() },
    expected: "Relayer entries for chain(s) [999]",
  },
  {
    label: "orphan alongside a valid entry",
    chains: [sepolia],
    relayers: { [11155111]: mockRelayerConfig(), [999]: mockRelayerConfig() },
    expected: "Relayer entries for chain(s) [999]",
  },
  {
    label: "multiple orphans listed in ascending id order",
    chains: [sepolia],
    relayers: {
      [11155111]: mockRelayerConfig(),
      [999]: mockRelayerConfig(),
      [888]: mockRelayerConfig("cleartext"),
    },
    expected: "Relayer entries for chain(s) [888, 999]",
  },
];

describe("resolveChainRelayers", () => {
  test("throws for duplicate chain ids (e.g. hardhat + anvil alias)", () => {
    expect(() =>
      resolveChainRelayers([hardhat, anvil], { [31337]: mockRelayerConfig() }, silent),
    ).toThrow("Duplicate chain id(s) [31337]");
  });

  test.each(missingCases)("throws when $label", ({ chains, relayers, expected }) => {
    expect(() => resolveChainRelayers(chains, relayers, silent)).toThrow(expected);
  });

  test.each(orphanCases)(
    "warns and drops orphaned relayer keys ($label)",
    ({ chains, relayers, expected }) => {
      const sink = makeLogger();

      const result = resolveChainRelayers(chains, relayers, new LoggerService(sink));

      expect([...result.keys()]).toEqual(chains.map((c) => c.id));
      expect(sink.warn).toHaveBeenCalledOnce();
      expect(sink.warn.mock.calls[0]?.[0]).toContain(expected);
    },
  );

  test("warns about orphans before throwing for a missing relayer", () => {
    const sink = makeLogger();

    expect(() =>
      resolveChainRelayers([sepolia], { [999]: mockRelayerConfig() }, new LoggerService(sink)),
    ).toThrow("Chain 11155111 has no relayer configured");
    expect(sink.warn.mock.calls[0]?.[0]).toContain("Relayer entries for chain(s) [999]");
  });

  test("stays silent when relayer keys match the chains exactly", () => {
    const sink = makeLogger();

    resolveChainRelayers([sepolia], { [11155111]: mockRelayerConfig() }, new LoggerService(sink));

    expect(sink.warn).not.toHaveBeenCalled();
  });

  test("resolves multiple chains and binds each to its relayer config", () => {
    const sepoliaCfg = mockRelayerConfig();
    const mainnetCfg = mockRelayerConfig();
    const result = resolveChainRelayers(
      [sepolia, mainnet],
      { [11155111]: sepoliaCfg, [1]: mainnetCfg },
      silent,
    );
    expect(result.size).toBe(2);
    expect(result.get(11155111)).toEqual({ chain: sepolia, relayerConfig: sepoliaCfg });
    expect(result.get(1)).toEqual({ chain: mainnet, relayerConfig: mainnetCfg });
  });
});

describe("resolveStorage", () => {
  test("defaults permitStorage to the credential storage when omitted", () => {
    const storage = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const resolved = resolveStorage(storage);
    expect(resolved.storage).toBe(storage);
    expect(resolved.permitStorage).toBe(storage);
  });

  test("uses an explicit permitStorage when provided", () => {
    const storage = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const permitStorage = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    const resolved = resolveStorage(storage, permitStorage);
    expect(resolved.storage).toBe(storage);
    expect(resolved.permitStorage).toBe(permitStorage);
  });

  test("falls back to a working default storage when none is provided", async () => {
    const { storage, permitStorage } = resolveStorage();
    expect(storage).toBe(permitStorage);
    // Drive the contract: a defaulted storage is a real GenericStorage that round-trips.
    await storage.set("k", { v: 1 });
    expect(await storage.get("k")).toEqual({ v: 1 });
    await storage.delete("k");
    expect(await storage.get("k")).toBeNull();
  });
});
