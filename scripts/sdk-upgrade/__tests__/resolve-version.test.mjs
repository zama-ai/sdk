import { describe, expect, test } from "vitest";
import { classifySpec, gitRefForVersion, resolveVersion } from "../lib/resolve-version.mjs";

describe("classifySpec", () => {
  test("recognises exact versions", () => {
    expect(classifySpec("3.1.0-alpha.5")).toEqual({ kind: "exact", value: "3.1.0-alpha.5" });
  });

  test("recognises dist-tags", () => {
    expect(classifySpec("latest")).toEqual({ kind: "dist-tag", value: "latest" });
    expect(classifySpec("alpha")).toEqual({ kind: "dist-tag", value: "alpha" });
  });

  test("rejects junk", () => {
    expect(() => classifySpec("3.x")).toThrow();
  });
});

test("gitRefForVersion prefixes v", () => {
  expect(gitRefForVersion("3.1.0-alpha.5")).toBe("v3.1.0-alpha.5");
});

describe("resolveVersion", () => {
  test("passes exact versions through without a network call", async () => {
    const fetchImpl = () => {
      throw new Error("should not fetch");
    };
    expect(await resolveVersion("3.1.0-alpha.5", { fetchImpl })).toEqual({
      version: "3.1.0-alpha.5",
      gitRef: "v3.1.0-alpha.5",
      source: "exact",
    });
  });

  test("resolves a dist-tag via the registry's dist-tags map", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ "dist-tags": { latest: "3.0.1", alpha: "3.1.0-alpha.5" } }),
    });
    expect(await resolveVersion("alpha", { fetchImpl })).toEqual({
      version: "3.1.0-alpha.5",
      gitRef: "v3.1.0-alpha.5",
      source: "alpha",
    });
  });

  test("throws on an unknown dist-tag", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ "dist-tags": { latest: "3.0.1" } }) });
    await expect(resolveVersion("beta", { fetchImpl })).rejects.toThrow(/No dist-tag "beta"/);
  });
});
