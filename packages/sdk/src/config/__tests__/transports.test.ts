import { describe, expect, it } from "vitest";
import { web } from "../web";
import { cleartext } from "../cleartext";
import { node } from "../../node";

describe("web()", () => {
  it("returns tagged config when called with no args", () => {
    const result = web();
    expect(result.type).toBe("web");
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });

  it("captures options in createWorker/createRelayer closures", () => {
    const result = web({ threads: 4 });
    expect(result.type).toBe("web");
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });
});

describe("node()", () => {
  it("returns tagged config when called with no args", () => {
    const result = node();
    expect(result.type).toBe("node");
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });

  it("captures options in createWorker/createRelayer closures", () => {
    const result = node({ poolSize: 4, logger: console });
    expect(result.type).toBe("node");
    expect(result.createWorker).toBeTypeOf("function");
    expect(result.createRelayer).toBeTypeOf("function");
  });
});

describe("cleartext()", () => {
  it("returns tagged config with no args", () => {
    const result = cleartext();
    expect(result.type).toBe("cleartext");
    expect(result.createRelayer).toBeTypeOf("function");
    expect(result.createWorker).toBeUndefined();
  });
});
