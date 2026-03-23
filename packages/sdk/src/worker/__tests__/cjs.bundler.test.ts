/**
 * Build-level smoke tests for the CJS bundling pipeline.
 *
 * These verify that `pnpm build` produces valid CJS output:
 * - Each declared CJS entry point exists with correct format
 * - The node subpath is ESM-only (no CJS require condition)
 * - The exports map includes default fallback conditions
 * - Sourcemaps are included in the published files list
 *
 * Run `pnpm build` before running these tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PKG_ROOT = resolve(__dirname, "../../..");
const DIST_CJS = resolve(PKG_ROOT, "dist/cjs");
const DIST_ESM = resolve(PKG_ROOT, "dist/esm");

const pkg = JSON.parse(readFileSync(resolve(PKG_ROOT, "package.json"), "utf-8"));
const exports = pkg.exports as Record<string, Record<string, unknown>>;

const cjsExports = Object.entries(exports).flatMap(([subpath, conditions]) => {
  const req = conditions.require as { types: string; default: string } | undefined;
  return req ? [{ subpath, file: req.default, types: req.types }] : [];
});

describe("CJS build smoke tests", () => {
  it("./node export does not have a require condition", () => {
    expect(exports["./node"]).not.toHaveProperty("require");
  });

  for (const { subpath, file, types } of cjsExports) {
    it(`${subpath} CJS entry point exists and is valid CommonJS`, () => {
      const content = readFileSync(resolve(PKG_ROOT, file), "utf-8");
      expect(content).toMatch(/exports/);
    });

    it(`${subpath} require condition has nested types`, () => {
      expect(existsSync(resolve(PKG_ROOT, types))).toBe(true);
    });
  }

  it("node worker file does NOT exist in CJS output", () => {
    expect(existsSync(resolve(DIST_CJS, "relayer-sdk.node-worker.js"))).toBe(false);
    expect(existsSync(resolve(DIST_CJS, "relayer-sdk.node-worker.cjs"))).toBe(false);
  });

  it("node worker file exists in ESM output", () => {
    expect(existsSync(resolve(DIST_ESM, "node/relayer-sdk.node-worker.js"))).toBe(true);
  });
});

describe("package.json export conditions", () => {
  it("every export has a default condition", () => {
    for (const [subpath, conditions] of Object.entries(exports)) {
      expect(conditions, `${subpath} missing "default"`).toHaveProperty("default");
    }
  });

  it("files array includes sourcemaps", () => {
    expect(pkg.files).toContain("dist/**/*.map");
  });
});
