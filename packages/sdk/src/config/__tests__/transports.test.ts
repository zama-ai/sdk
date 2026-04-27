import { describe, expect, it } from "vitest";
import { web, cleartext } from "../transports";
import { node } from "../../node";

describe("web()", () => {
  it("returns tagged empty config when called with no args", () => {
    const result = web();
    expect(result.type).toBe("web");
    expect(result.chain).toBeUndefined();
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });

  it("passes chain overrides", () => {
    const result = web({ relayerUrl: "https://r.example.com" });
    expect(result.type).toBe("web");
    expect(result.chain).toEqual({ relayerUrl: "https://r.example.com" });
    expect(result.createRelayer).toBeTypeOf("function");
  });

  it("captures options in createWorker/createRelayer closures", () => {
    const result = web({ relayerUrl: "https://r.example.com" }, { threads: 4 });
    expect(result.type).toBe("web");
    expect(result.chain).toEqual({ relayerUrl: "https://r.example.com" });
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });
});

describe("node()", () => {
  it("returns tagged empty config when called with no args", () => {
    const result = node();
    expect(result.type).toBe("node");
    expect(result.chain).toBeUndefined();
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });

  it("passes chain overrides", () => {
    const result = node({ relayerUrl: "https://r.example.com" });
    expect(result.type).toBe("node");
    expect(result.chain).toEqual({ relayerUrl: "https://r.example.com" });
    expect(result.createRelayer).toBeTypeOf("function");
  });

  it("captures options in createWorker/createRelayer closures", () => {
    const result = node({ relayerUrl: "https://r.example.com" }, { poolSize: 4, logger: console });
    expect(result.type).toBe("node");
    expect(result.chain).toEqual({ relayerUrl: "https://r.example.com" });
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });
});

describe("cleartext()", () => {
  it("returns tagged config with no args", () => {
    const result = cleartext();
    expect(result.type).toBe("cleartext");
    expect(result.chain).toBeUndefined();
    expect(result.createRelayer).toBeTypeOf("function");
    expect(result.createWorker).toBeUndefined();
  });

  it("returns tagged config with chain overrides", () => {
    const chain = { executorAddress: "0x1234" as `0x${string}` };
    const result = cleartext(chain);
    expect(result.type).toBe("cleartext");
    expect(result.chain).toEqual(chain);
    expect(result.createRelayer).toBeTypeOf("function");
    expect(result.createWorker).toBeUndefined();
  });
});
