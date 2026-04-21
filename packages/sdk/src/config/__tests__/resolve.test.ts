import { describe, expect, it, vi } from "vitest";
import { web, node, cleartext } from "../transports";
import { ConfigurationError } from "../../errors";
import { sepolia, mainnet, hoodi } from "../../chains";

vi.mock(import("../../relayer/relayer-web"), async () => ({
  RelayerWeb: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
  }),
}));

// Note: relayer-node is NOT mocked here — it's no longer imported by resolve.ts.
// The node transport handler is registered via @zama-fhe/sdk/node (side-effect import).

vi.mock(import("../../relayer/cleartext/relayer-cleartext"), async () => ({
  RelayerCleartext: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
  }),
}));

// Import after mocks
const { resolveChainTransports, buildRelayer } = await import("../resolve");

const sepoliaChain = sepolia;
const mainnetChain = mainnet;
const hoodiChain = hoodi;

describe("resolveChainTransports", () => {
  it("resolves chains with default web transport when no transports provided", () => {
    const result = resolveChainTransports([sepoliaChain], undefined, [11155111]);
    expect(result.size).toBe(1);
    const entry = result.get(11155111);
    expect(entry?.chain.chainId).toBe(sepoliaChain.id);
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
      "transport configured but no entry in the chains array",
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

  it("wraps single web chain in CompositeRelayer", () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    const relayer = buildRelayer(transports, resolveChainId);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
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

  it("returns CompositeRelayer for multiple web chains", () => {
    const transports = resolveChainTransports(
      [sepoliaChain, mainnetChain],
      { [11155111]: web(), [1]: web() },
      [11155111, 1],
    );
    const relayer = buildRelayer(transports, resolveChainId);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
  });

  it("throws when web transport chain has empty relayerUrl", () => {
    const transports = resolveChainTransports([hoodiChain], { [560048]: web() }, [560048]);
    expect(() => buildRelayer(transports, resolveChainId)).toThrow(
      "Chain 560048 has an empty relayerUrl",
    );
  });

  it("throws for node transport when handler is not registered", () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: node() }, [11155111]);
    expect(() => buildRelayer(transports, resolveChainId)).toThrow(
      'No transport handler registered for type "node"',
    );
  });
});
