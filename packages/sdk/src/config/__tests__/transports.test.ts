import { describe, expect, it } from "vitest";
import { web, node, cleartext } from "../transports";

describe("web()", () => {
  it("returns tagged empty config when called with no args", () => {
    expect(web()).toEqual({ type: "web", chain: undefined, relayer: undefined });
  });

  it("passes chain overrides", () => {
    expect(web({ relayerUrl: "https://r.example.com" })).toEqual({
      type: "web",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: undefined,
    });
  });

  it("passes chain and relayer params separately", () => {
    const relayerOpts = { threads: 4 } as const;
    expect(web({ relayerUrl: "https://r.example.com" }, relayerOpts)).toEqual({
      type: "web",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: relayerOpts,
    });
  });
});

describe("node()", () => {
  it("returns tagged empty config when called with no args", () => {
    expect(node()).toEqual({ type: "node", chain: undefined, relayer: undefined });
  });

  it("passes chain overrides", () => {
    expect(node({ relayerUrl: "https://r.example.com" })).toEqual({
      type: "node",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: undefined,
    });
  });

  it("passes chain and relayer params separately", () => {
    const relayerOpts = { poolSize: 4 };
    expect(node({ relayerUrl: "https://r.example.com" }, relayerOpts)).toEqual({
      type: "node",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: relayerOpts,
    });
  });
});

describe("cleartext()", () => {
  it("returns tagged config with required chain", () => {
    const chain = { executorAddress: "0x1234" as `0x${string}` };
    expect(cleartext(chain)).toEqual({
      type: "cleartext",
      chain,
    });
  });
});
