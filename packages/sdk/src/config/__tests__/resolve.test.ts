import { describe, expect, it, vi } from "vitest";
import { web, cleartext } from "../relayers";
import { node } from "../../node";
import { sepolia, mainnet, hoodi, hardhat, anvil, type FheChain } from "../../chains";

vi.mock(import("../../relayer/relayer-web"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    RelayerWeb: vi.fn().mockImplementation(function (this: any) {
      this.terminate = vi.fn();
      this.generateKeypair = vi.fn().mockResolvedValue({ publicKey: "0x", secretKey: "0x" });
    }),
  };
});

vi.mock(import("../../worker/worker.client"), async () => ({
  RelayerWorkerClient: vi.fn().mockImplementation(function (this: any) {
    this.initWorker = vi.fn().mockResolvedValue(undefined);
    this.terminate = vi.fn();
  }),
}));

vi.mock(import("../../relayer/cleartext/relayer-cleartext"), async () => ({
  RelayerCleartext: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
    this.generateKeypair = vi.fn().mockResolvedValue({ publicKey: "0x", secretKey: "0x" });
  }),
}));

// Import after mocks
const { resolveChainRelayers } = await import("../resolve");
const { RelayerDispatcher } = await import("../../relayer/relayer-dispatcher");

const sepoliaChain = sepolia;
const mainnetChain = mainnet;
const hoodiChain = hoodi;

describe("resolveChainRelayers", () => {
  it("throws for duplicate chain ids (e.g. hardhat + anvil alias)", () => {
    expect(() => resolveChainRelayers([hardhat, anvil], { [31337]: web() })).toThrow(
      "Duplicate chain id(s) [31337]",
    );
  });

  it("throws when a chain has no relayer entry", () => {
    expect(() => resolveChainRelayers([sepoliaChain], {})).toThrow(
      "Chain 11155111 has no relayer configured",
    );
  });

  it("resolves chains with explicit web relayer", () => {
    const relayerCfg = web();
    const result = resolveChainRelayers([sepoliaChain], {
      [11155111]: relayerCfg,
    });
    expect(result.get(11155111)?.relayer).toBe(relayerCfg);
  });

  it("resolves chains with node relayer", () => {
    const relayerCfg = node();
    const result = resolveChainRelayers([sepoliaChain], {
      [11155111]: relayerCfg,
    });
    expect(result.get(11155111)?.relayer).toBe(relayerCfg);
  });

  it("resolves chains with cleartext relayer", () => {
    const relayerCfg = cleartext();
    const result = resolveChainRelayers([hoodiChain], {
      [560048]: relayerCfg,
    });
    expect(result.get(560048)?.relayer).toBe(relayerCfg);
  });

  it("resolves multiple chains", () => {
    const result = resolveChainRelayers([sepoliaChain, mainnetChain], {
      [11155111]: web(),
      [1]: web(),
    });
    expect(result.size).toBe(2);
  });

  it("throws for chain with no relayer entry", () => {
    expect(() =>
      resolveChainRelayers([sepoliaChain, { id: 999999 } as FheChain], {
        [11155111]: web(),
      }),
    ).toThrow("Chain 999999 has no relayer configured");
  });

  it("throws for cleartext relayer with missing chain config", () => {
    const relayerCfg = cleartext();
    expect(() => resolveChainRelayers([], { [999]: relayerCfg })).toThrow(
      "Relayer entries for chain(s) [999]",
    );
  });

  it("throws for web/node relayer with missing chain config", () => {
    expect(() => resolveChainRelayers([], { [999]: web() })).toThrow(
      "Relayer entries for chain(s) [999]",
    );
    expect(() => resolveChainRelayers([], { [999]: node() })).toThrow(
      "Relayer entries for chain(s) [999]",
    );
  });

  it("throws for orphaned relayer keys not in chains", () => {
    expect(() =>
      resolveChainRelayers([sepoliaChain], {
        [11155111]: web(),
        [999]: web(),
      }),
    ).toThrow("Relayer entries for chain(s) [999]");
  });

  it("throws for multiple orphaned relayer keys", () => {
    expect(() =>
      resolveChainRelayers([sepoliaChain], {
        [11155111]: web(),
        [999]: web(),
        [888]: node(),
      }),
    ).toThrow("Relayer entries for chain(s) [888, 999]");
  });
});

/** Helper: build a RelayerDispatcher from chains + relayer config map. */
function buildDispatcher(
  chains: FheChain[],
  relayerMap: Record<number, ReturnType<typeof web> | ReturnType<typeof cleartext>>,
) {
  return new RelayerDispatcher(chains as [FheChain, ...FheChain[]], relayerMap);
}

describe("RelayerDispatcher (via relayer factories)", () => {
  it("creates relayers eagerly at construction time", () => {
    const createRelayerSpy = vi.fn().mockReturnValue({
      terminate: vi.fn(),
      generateKeypair: vi.fn().mockResolvedValue({ publicKey: "0x", secretKey: "0x" }),
    });
    const baseRelayerCfg = web();
    const relayerCfg = { ...baseRelayerCfg, createRelayer: createRelayerSpy };
    new RelayerDispatcher([sepoliaChain], { [11155111]: relayerCfg });
    expect(createRelayerSpy).toHaveBeenCalledOnce();
  });

  it("delegates generateKeypair to the active chain relayer", async () => {
    const relayer = buildDispatcher([sepoliaChain], { [11155111]: web() });
    const result = await relayer.generateKeypair();
    expect(result).toEqual({ publicKey: "0x", secretKey: "0x" });
  });

  it("throws when switching to unconfigured chain", () => {
    const relayer = buildDispatcher([sepoliaChain], { [11155111]: web() });
    expect(() => relayer.switchChain(999999)).toThrow("No relayer configured for chain 999999");
  });

  it("wraps single web chain", () => {
    const relayer = buildDispatcher([sepoliaChain], { [11155111]: web() });
    expect(relayer.constructor.name).toBe("RelayerDispatcher");
  });

  it("supports mixed web + cleartext", () => {
    const relayer = buildDispatcher([sepoliaChain, hoodiChain], {
      [11155111]: web(),
      [560048]: cleartext(),
    });
    expect(relayer.constructor.name).toBe("RelayerDispatcher");
  });

  it("concurrent calls to the same chain return equal results", async () => {
    const relayer = buildDispatcher([sepoliaChain], { [11155111]: web() });
    relayer.switchChain(11155111);
    const [a, b] = await Promise.all([relayer.generateKeypair(), relayer.generateKeypair()]);
    expect(a).toEqual(b);
  });
});
