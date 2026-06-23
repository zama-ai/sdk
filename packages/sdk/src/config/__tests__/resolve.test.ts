import { describe, expect, test, vi } from "../../test-fixtures";
import { resolveChainRelayers, resolveStorage } from "../resolve";
import { sepolia, mainnet, hardhat, anvil, type FheChain } from "../../chains";
import type { RelayerConfig } from "../types";
import type { RelayerSDK } from "../../relayer/relayer-sdk.types";

/** Stub the public RelayerConfig seam — no internal-module mocking. */
function mockRelayerConfig(type: RelayerConfig["type"] = "web"): RelayerConfig {
  return {
    type,
    createRelayer: () => ({}) as unknown as RelayerSDK,
  };
}

describe("resolveChainRelayers", () => {
  test("throws for duplicate chain ids (e.g. hardhat + anvil alias)", () => {
    expect(() => resolveChainRelayers([hardhat, anvil], { [31337]: mockRelayerConfig() })).toThrow(
      "Duplicate chain id(s) [31337]",
    );
  });

  test.each([
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
  ])("throws when $label", ({ chains, relayers, expected }) => {
    expect(() => resolveChainRelayers(chains, relayers)).toThrow(expected);
  });

  test.each([
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
      label: "multiple orphans listed in order",
      chains: [sepolia],
      relayers: {
        [11155111]: mockRelayerConfig(),
        [999]: mockRelayerConfig(),
        [888]: mockRelayerConfig("cleartext"),
      },
      expected: "Relayer entries for chain(s) [888, 999]",
    },
  ])("throws for orphaned relayer keys ($label)", ({ chains, relayers, expected }) => {
    expect(() => resolveChainRelayers(chains, relayers)).toThrow(expected);
  });

  test("resolves multiple chains and binds each to its relayer config", () => {
    const sepoliaCfg = mockRelayerConfig();
    const mainnetCfg = mockRelayerConfig();
    const result = resolveChainRelayers([sepolia, mainnet], {
      [11155111]: sepoliaCfg,
      [1]: mainnetCfg,
    });
    expect(result.size).toBe(2);
    expect(result.get(11155111)).toEqual({
      chain: sepolia,
      relayer: sepoliaCfg,
    });
    expect(result.get(1)).toEqual({ chain: mainnet, relayer: mainnetCfg });
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
