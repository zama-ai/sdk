import { describe, expect, it, vi } from "vitest";
import { web, node, cleartext } from "../transports";
import { sepolia, mainnet, hoodi } from "../../chains";

vi.mock(import("../../relayer/relayer-web"), async () => ({
  RelayerWeb: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
    this.generateKeypair = vi.fn().mockResolvedValue({ publicKey: "0x", secretKey: "0x" });
  }),
}));

// Note: relayer-node is NOT mocked here — it's no longer imported by resolve.ts.
// The node transport handler is registered via @zama-fhe/sdk/node (side-effect import).

vi.mock(import("../../relayer/cleartext/relayer-cleartext"), async () => ({
  RelayerCleartext: vi.fn().mockImplementation(function (this: any) {
    this.terminate = vi.fn();
    this.generateKeypair = vi.fn().mockResolvedValue({ publicKey: "0x", secretKey: "0x" });
  }),
}));

// Import after mocks
const { resolveChainTransports } = await import("../resolve");
const { CompositeRelayer } = await import("../../relayer/composite-relayer");
const { relayersMap } = await import("../relayers");

const sepoliaChain = sepolia;
const mainnetChain = mainnet;
const hoodiChain = hoodi;

describe("resolveChainTransports", () => {
  it("throws when a chain has no transport entry", () => {
    expect(() => resolveChainTransports([sepoliaChain], {}, [11155111])).toThrow(
      "Chain 11155111 has no transport configured",
    );
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

  it("throws for chain ID with no transport entry", () => {
    expect(() => resolveChainTransports([sepoliaChain], { [11155111]: web() }, [999999])).toThrow(
      "Chain 999999 has no transport configured",
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

describe("CompositeRelayer (lazy init)", () => {
  it("does not call transport handler at construction time", () => {
    const handlerSpy = vi.fn();
    const origWeb = relayersMap.get("web")!;
    relayersMap.set("web", handlerSpy);

    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    new CompositeRelayer(() => Promise.resolve(11155111), transports);

    expect(handlerSpy).not.toHaveBeenCalled();
    relayersMap.set("web", origWeb);
  });

  it("calls transport handler on first SDK operation", async () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);

    // generateKeypair triggers #current() which triggers lazy init
    await relayer.generateKeypair();
    // If we get here without error, the handler was called and RelayerWeb mock was constructed
  });

  it("throws for unconfigured chain on first use", async () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    const relayer = new CompositeRelayer(() => Promise.resolve(999999), transports);

    await expect(relayer.generateKeypair()).rejects.toThrow(
      "No relayer configured for chain 999999",
    );
  });

  it("throws for unregistered transport handler on first use", async () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: node() }, [11155111]);
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);

    await expect(relayer.generateKeypair()).rejects.toThrow(
      'No transport handler registered for type "node"',
    );
  });

  it("wraps single web chain", async () => {
    const transports = resolveChainTransports([sepoliaChain], { [11155111]: web() }, [11155111]);
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
  });

  it("supports mixed web + cleartext", () => {
    const transports = resolveChainTransports(
      [sepoliaChain, hoodiChain],
      {
        [11155111]: web(),
        [560048]: cleartext({ executorAddress: "0xExec" as `0x${string}` }),
      },
      [11155111, 560048],
    );
    const relayer = new CompositeRelayer(() => Promise.resolve(11155111), transports);
    expect(relayer.constructor.name).toBe("CompositeRelayer");
  });
});
