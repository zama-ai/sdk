import { describe, expect, test } from "vitest";
import { parseVersion, compareVersions } from "../lib/semver.mjs";

describe("parseVersion", () => {
  test("parses release and prerelease", () => {
    expect(parseVersion("3.1.0")).toEqual({ major: 3, minor: 1, patch: 0, pre: [] });
    expect(parseVersion("3.1.0-alpha.5")).toEqual({
      major: 3,
      minor: 1,
      patch: 0,
      pre: ["alpha", "5"],
    });
  });

  test("returns null on garbage", () => {
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("3.1")).toBeNull();
  });
});

describe("compareVersions", () => {
  test("orders by major/minor/patch", () => {
    expect(compareVersions("3.0.1", "3.1.0")).toBe(-1);
    expect(compareVersions("3.1.0", "3.0.9")).toBe(1);
    expect(compareVersions("3.1.0", "3.1.0")).toBe(0);
  });

  test("prerelease sorts below its release", () => {
    expect(compareVersions("3.1.0-alpha.5", "3.1.0")).toBe(-1);
    expect(compareVersions("3.1.0", "3.1.0-alpha.5")).toBe(1);
  });

  test("compares numeric prerelease identifiers numerically", () => {
    expect(compareVersions("3.0.0-alpha.32", "3.0.0-alpha.34")).toBe(-1);
    expect(compareVersions("3.1.0-alpha.10", "3.1.0-alpha.9")).toBe(1);
  });

  test("throws on unparseable input", () => {
    expect(() => compareVersions("latest", "3.0.0")).toThrow(/Unparseable version/);
  });
});
