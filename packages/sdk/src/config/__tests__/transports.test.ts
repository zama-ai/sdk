import { describe, expect, it } from "vitest";
import { web, cleartext } from "../transports";
import { node } from "../../node";

describe("web()", () => {
  it("returns tagged empty config when called with no args", () => {
    expect(web()).toMatchObject({ type: "web", chain: undefined, relayer: undefined });
  });

  it("passes chain overrides", () => {
    expect(web({ relayerUrl: "https://r.example.com" })).toMatchObject({
      type: "web",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: undefined,
    });
  });

  it("passes chain and relayer params separately", () => {
    const relayerOpts = { threads: 4 } as const;
    expect(web({ relayerUrl: "https://r.example.com" }, relayerOpts)).toMatchObject({
      type: "web",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: relayerOpts,
    });
  });
});

describe("node()", () => {
  it("returns tagged empty config when called with no args", () => {
    expect(node()).toMatchObject({ type: "node", chain: undefined, relayer: undefined });
  });

  it("passes chain overrides", () => {
    expect(node({ relayerUrl: "https://r.example.com" })).toMatchObject({
      type: "node",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: undefined,
    });
  });

  it("passes chain and relayer params separately", () => {
    const relayerOpts = { poolSize: 4 };
    expect(node({ relayerUrl: "https://r.example.com" }, relayerOpts)).toMatchObject({
      type: "node",
      chain: { relayerUrl: "https://r.example.com" },
      relayer: relayerOpts,
    });
  });
});

describe("cleartext()", () => {
  it("returns tagged config with required chain", () => {
    const chain = { executorAddress: "0x1234" as `0x${string}` };
    expect(cleartext(chain)).toMatchObject({
      type: "cleartext",
      chain,
    });
  });
});
