import { describe, expect, it, vi } from "vitest";
import { web, node, cleartext } from "../transports";
import { SepoliaConfig, MainnetConfig, HoodiConfig } from "../../relayer/relayer-utils";
import { ConfigurationError } from "../../errors";

vi.mock(import("../../relayer/relayer-web"), async () => ({
  RelayerWeb: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
  }),
}));

vi.mock(import("../../relayer/relayer-node"), async () => ({
  RelayerNode: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
  }),
}));

// Import after mocks
const { resolveChainTransports, buildRelayer } = await import("../resolve");

const sepoliaChain = SepoliaConfig;
const mainnetChain = MainnetConfig;
const hoodiChain = HoodiConfig;

describe("resolveChainTransports", () => {
  it("resolves chains with default web transport when no transports provided", () => {
    const result = resolveChainTransports([sepoliaChain], undefined, [11155111]);
    expect(result.size).toBe(1);
    const entry = result.get(11155111);
    expect(entry?.chain).toBe(sepoliaChain);
    expect(entry?.transport.type).toBe("web");
  });

  it("resolves chains with explicit web transport", () => {
    const transport = web({ relayerUrl: "https://custom.com" });
    const result = resolveChainTransports([sepoliaChain], { [11155111]: transport }, [11155111]);
    expect(result.get(11155111)?.transport).toBe(transport);
  });

  it("resolves chains with node transport", () => {
    const transport = node({ relayerUrl: "https://custom.com" });
    const result = resolveChainTransports([sepoliaChain], { [11155111]: transport }, [11155111]);
    expect(result.get(11155111)?.transport).toBe(transport);
  });

  it("resolves chains with cleartext transport", () => {
    const transport = cleartext({ executorAddress: "0xExec" as `0x${string}` });
    const result = resolveChainTransports([hoodiChain], { [560048]: transport }, [560048]);
    expect(result.get(560048)?.transport).toBe(transport);
  });

  it("resolves multiple chains", () => {
    const result = resolveChainTransports(
      [sepoliaChain, mainnetChain],
      { [11155111]: web(), [1]: web() },
      [11155111, 1],
    );
    expect(result.size).toBe(2);
  });

  it("throws for chain with no config and no transport", () => {
    expect(() => resolveChainTransports([sepoliaChain], undefined, [999999])).toThrow(
      ConfigurationError,
    );
    expect(() => resolveChainTransports([sepoliaChain], undefined, [999999])).toThrow(
      "Chain 999999",
    );
  });

  it("throws for cleartext transport with missing chain config", () => {
    const transport = cleartext({ executorAddress: "0xExec" as `0x${string}` });
    expect(() => resolveChainTransports([], { [999]: transport }, [999])).toThrow(
      "cleartext transport but has no entry",
    );
  });

  it("throws for web/node transport with missing chain config", () => {
    expect(() => resolveChainTransports([], { [999]: web() }, [999])).toThrow(
      "transport configured but no entry in the chains array",
    );
    expect(() => resolveChainTransports([], { [999]: node() }, [999])).toThrow(
      "transport configured but no entry in the chains array",
    );
  });

  it("throws for unrecognized transport type", () => {
    const bad = { type: "unknown" } as any;
    expect(() => resolveChainTransports([sepoliaChain], { [11155111]: bad }, [11155111])).toThrow(
      "unrecognized transport",
    );
  });

  it("throws for orphaned transport keys not in chainIds", () => {
    expect(() =>
      resolveChainTransports([sepoliaChain], { [11155111]: web(), [999]: web() }, [11155111]),
    ).toThrow("Transport entries for chain(s) [999]");
  });

  it("throws for multiple orphaned transport keys", () => {
    expect(() =>
      resolveChainTransports(
        [sepoliaChain],
        { [11155111]: web(), [999]: web(), [888]: node() },
        [11155111],
      ),
    ).toThrow("Transport entries for chain(s) [888, 999]");
  });
});

describe("buildRelayer", () => {
  const resolveChainId = () => Promise.resolve(11155111);

  it("throws on empty chainTransports", () => {
    expect(() => buildRelayer(new Map(), resolveChainId)).toThrow("No chain transports configured");
  });

  it("returns unwrapped relayer for single web chain", () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    const relayer = buildRelayer(transports, resolveChainId);
    // Single chain should not be wrapped in CompositeRelayer
    expect(relayer.constructor.name).not.toBe("CompositeRelayer");
  });

  it("returns CompositeRelayer for mixed web + cleartext", () => {
    const transports = resolveChainTransports(
      [sepoliaChain, hoodiChain],
      {
        [11155111]: web(),
        [560048]: cleartext({ executorAddress: "0xExec" as `0x${string}` }),
      },
      [11155111, 560048],
    );
    const relayer = buildRelayer(transports, resolveChainId);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
  });

  it("returns unwrapped relayer when all chains share the same relayer instance", () => {
    const transports = resolveChainTransports(
      [sepoliaChain, mainnetChain],
      { [11155111]: web(), [1]: web() },
      [11155111, 1],
    );
    const relayer = buildRelayer(transports, resolveChainId);
    // Both use default web (same undefined relayer ref) → single RelayerWeb
    expect(relayer.constructor.name).not.toBe("CompositeRelayer");
  });

  it("creates separate relayers for distinct relayer option references", () => {
    const opts1 = { threads: 2 };
    const opts2 = { threads: 4 };
    const transports = resolveChainTransports(
      [sepoliaChain, mainnetChain],
      { [11155111]: web(undefined, opts1), [1]: web(undefined, opts2) },
      [11155111, 1],
    );
    const relayer = buildRelayer(transports, resolveChainId);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
  });
});
