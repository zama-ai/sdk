import { describe, expect, it, vi } from "vitest";
import { web, cleartext } from "../transports";
import { node } from "../../node";
import { sepolia, mainnet, hoodi, hardhat, anvil, type FheChain } from "../../chains";

vi.mock(import("../../relayer/relayer-web"), async () => ({
  RelayerWeb: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
    this.generateKeypair = vi.fn().mockResolvedValue({ publicKey: "0x", secretKey: "0x" });
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
const { CompositeRelayer } = await import("../../relayer/composite-relayer");
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

describe("CompositeRelayer (lazy init)", () => {
  it("does not call createRelayer at construction time", () => {
    const createRelayerSpy = vi.fn();
    const transport = { ...web(), createRelayer: createRelayerSpy };
    const transports = resolveChainTransports([sepoliaChain], {
      [11155111]: transport,
    });
    new CompositeRelayer(() => Promise.resolve(11155111), transports);
    expect(createRelayerSpy).not.toHaveBeenCalled();
  });

  it("calls createRelayer on first SDK operation", async () => {
    const transports = resolveChainTransports([sepoliaChain], {
      [11155111]: web(),
    });
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);
    await relayer.generateKeypair();
  });

  it("throws for unconfigured chain on first use", async () => {
    const transports = resolveChainTransports([sepoliaChain], {
      [11155111]: web(),
    });
    const relayer = new CompositeRelayer(() => Promise.resolve(999999), transports);
    await expect(relayer.generateKeypair()).rejects.toThrow(
      "No relayer configured for chain 999999",
    );
  });

  it("wraps single web chain", () => {
    const transports = resolveChainTransports([sepoliaChain], {
      [11155111]: web(),
    });
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
  });

  it("supports mixed web + cleartext", () => {
    const transports = resolveChainTransports([sepoliaChain, hoodiChain], {
      [11155111]: web(),
      [560048]: cleartext({ executorAddress: "0xExec" as `0x${string}` }),
    });
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
  });

  it("deduplicates concurrent first-use for the same chain", async () => {
    const transports = resolveChainTransports([sepoliaChain], {
      [11155111]: web(),
    });
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);
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
