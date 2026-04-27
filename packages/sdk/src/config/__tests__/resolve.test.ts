import { describe, expect, it, vi } from "vitest";
import { web, cleartext } from "../transports";
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
const { resolveChainTransports } = await import("../resolve");
const { RelayerDispatcher } = await import("../../relayer/relayer-dispatcher");
const { buildZamaConfig } = await import("../build");

const sepoliaChain = sepolia;
const mainnetChain = mainnet;
const hoodiChain = hoodi;

describe("resolveChainTransports", () => {
  it("throws for duplicate chain ids (e.g. hardhat + anvil alias)", () => {
    expect(() => resolveChainTransports([hardhat, anvil], { [31337]: web() })).toThrow(
      "Duplicate chain id(s) [31337]",
    );
  });

  it("throws when a chain has no transport entry", () => {
    expect(() => resolveChainTransports([sepoliaChain], {})).toThrow(
      "Chain 11155111 has no transport configured",
    );
  });

  it("resolves chains with explicit web transport", () => {
    const transport = web({ relayerUrl: "https://custom.com" });
    const result = resolveChainTransports([sepoliaChain], {
      [11155111]: transport,
    });
    expect(result.get(11155111)?.transport).toBe(transport);
  });

  it("resolves chains with node transport", () => {
    const transport = node({ relayerUrl: "https://custom.com" });
    const result = resolveChainTransports([sepoliaChain], {
      [11155111]: transport,
    });
    expect(result.get(11155111)?.transport).toBe(transport);
  });

  it("resolves chains with cleartext transport", () => {
    const transport = cleartext({ executorAddress: "0xExec" as `0x${string}` });
    const result = resolveChainTransports([hoodiChain], {
      [560048]: transport,
    });
    expect(result.get(560048)?.transport).toBe(transport);
  });

  it("resolves multiple chains", () => {
    const result = resolveChainTransports([sepoliaChain, mainnetChain], {
      [11155111]: web(),
      [1]: web(),
    });
    expect(result.size).toBe(2);
  });

  it("throws for chain with no transport entry", () => {
    expect(() =>
      resolveChainTransports([sepoliaChain, { id: 999999 } as FheChain], {
        [11155111]: web(),
      }),
    ).toThrow("Chain 999999 has no transport configured");
  });

  it("throws for cleartext transport with missing chain config", () => {
    const transport = cleartext({ executorAddress: "0xExec" as `0x${string}` });
    expect(() => resolveChainTransports([], { [999]: transport })).toThrow(
      "Transport entries for chain(s) [999]",
    );
  });

  it("throws for web/node transport with missing chain config", () => {
    expect(() => resolveChainTransports([], { [999]: web() })).toThrow(
      "Transport entries for chain(s) [999]",
    );
    expect(() => resolveChainTransports([], { [999]: node() })).toThrow(
      "Transport entries for chain(s) [999]",
    );
  });

  it("throws for unrecognized transport type", () => {
    const bad = { type: "unknown" } as any;
    expect(() => resolveChainTransports([sepoliaChain], { [11155111]: bad })).toThrow(
      "unrecognized transport",
    );
  });

  it("throws for orphaned transport keys not in chains", () => {
    expect(() =>
      resolveChainTransports([sepoliaChain], {
        [11155111]: web(),
        [999]: web(),
      }),
    ).toThrow("Transport entries for chain(s) [999]");
  });

  it("throws for multiple orphaned transport keys", () => {
    expect(() =>
      resolveChainTransports([sepoliaChain], {
        [11155111]: web(),
        [999]: web(),
        [888]: node(),
      }),
    ).toThrow("Transport entries for chain(s) [888, 999]");
  });
});

/** Helper: build a RelayerDispatcher from chains + transport map using the same group-then-create pattern as buildZamaConfig. */
function buildDispatcher(
  chains: FheChain[],
  transportMap: Record<number, ReturnType<typeof web> | ReturnType<typeof cleartext>>,
) {
  const resolved = resolveChainTransports(chains, transportMap);
  // Group chains by transport reference identity
  const groups = new Map<any, [number, any][]>();
  for (const [chainId, config] of resolved) {
    const key = config.transport;
    if (!groups.has(key)) {groups.set(key, []);}
    groups.get(key)!.push([chainId, { ...config.chain, ...key.chain }]);
  }
  const relayers = new Map<number, any>();
  for (const [transport, groupChains] of groups) {
    const allConfigs = groupChains.map(([, c]) => c);
    const worker = transport.createWorker?.(allConfigs);
    for (const [chainId, chain] of groupChains) {
      relayers.set(chainId, transport.createRelayer(chain, worker));
    }
  }
  const chainMap = new Map(chains.map((c) => [c.id, c]));
  return new RelayerDispatcher(chainMap, relayers);
}

describe("RelayerDispatcher (via transport factories)", () => {
  it("creates relayers eagerly at construction time", () => {
    const createRelayerSpy = vi.fn().mockReturnValue({
      terminate: vi.fn(),
      generateKeypair: vi.fn().mockResolvedValue({ publicKey: "0x", secretKey: "0x" }),
    });
    const baseTransport = web();
    const transport = { ...baseTransport, createRelayer: createRelayerSpy };
    const resolved = resolveChainTransports([sepoliaChain], { [11155111]: transport });
    // Use same group-then-create pattern
    const groups = new Map<any, [number, any][]>();
    for (const [chainId, config] of resolved) {
      const key = config.transport;
      if (!groups.has(key)) {groups.set(key, []);}
      groups.get(key)!.push([chainId, { ...config.chain, ...key.chain }]);
    }
    const relayers = new Map<number, any>();
    for (const [t, groupChains] of groups) {
      const allConfigs = groupChains.map(([, c]) => c);
      const worker = t.createWorker?.(allConfigs);
      for (const [chainId, chain] of groupChains) {
        relayers.set(chainId, t.createRelayer(chain, worker));
      }
    }
    new RelayerDispatcher(new Map([[sepoliaChain.id, sepoliaChain]]), relayers);
    expect(createRelayerSpy).toHaveBeenCalledOnce();
  });

  it("delegates generateKeypair to the active chain relayer", async () => {
    const relayer = buildDispatcher([sepoliaChain], { [11155111]: web() });
    relayer.switchChain(11155111);
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
      [560048]: cleartext({ executorAddress: "0xExec" as `0x${string}` }),
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

describe("buildZamaConfig (mergeRegistryAddresses)", () => {
  const mockSigner = {
    getAddress: vi.fn().mockResolvedValue("0x1234" as `0x${string}`),
    getChainId: vi.fn().mockResolvedValue(11155111),
    signTypedData: vi.fn(),
  };
  const mockProvider = {
    getChainId: vi.fn().mockResolvedValue(11155111),
    readContract: vi.fn(),
    waitForTransactionReceipt: vi.fn(),
    getBlockTimestamp: vi.fn(),
  };

  it("propagates transport registryAddress to chain config", () => {
    const customRegistry = "0xCustomRegistry" as `0x${string}`;
    const config = buildZamaConfig(mockSigner as any, mockProvider as any, {
      chains: [sepoliaChain],
      transports: {
        [11155111]: web({ registryAddress: customRegistry }),
      },
    });
    expect(config.chains[0].registryAddress).toBe(customRegistry);
  });

  it("preserves chain registryAddress when transport has none", () => {
    const config = buildZamaConfig(mockSigner as any, mockProvider as any, {
      chains: [sepoliaChain],
      transports: { [11155111]: web() },
    });
    expect(config.chains[0].registryAddress).toBe(sepoliaChain.registryAddress);
  });
});
