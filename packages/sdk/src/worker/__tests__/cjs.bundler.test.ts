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

const DIST_CJS = resolve(__dirname, "../../../dist/cjs");
const DIST_ESM = resolve(__dirname, "../../../dist/esm");

const pkgPath = resolve(__dirname, "../../../package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const exports = pkg.exports as Record<string, Record<string, string>>;

const cjsExports = Object.entries(exports)
  .filter(([, conditions]) => conditions.require)
  .map(([subpath, conditions]) => ({ subpath, file: conditions.require }));

describe("CJS build smoke tests", () => {
  it("./node export does not have a require condition", () => {
    expect(exports["./node"]).not.toHaveProperty("require");
  });

  for (const { subpath, file } of cjsExports) {
    it(`${subpath} CJS entry point exists at ${file}`, () => {
      const fullPath = resolve(__dirname, "../../..", file);
      expect(existsSync(fullPath)).toBe(true);
    });

    it(`${subpath} CJS entry point is valid CommonJS`, () => {
      const fullPath = resolve(__dirname, "../../..", file);
      const content = readFileSync(fullPath, "utf-8");
      expect(content).toMatch(/exports/);
    });
  }

  it("node worker file does NOT exist in CJS output", () => {
    expect(existsSync(resolve(DIST_CJS, "relayer-sdk.node-worker.js"))).toBe(false);
    expect(existsSync(resolve(DIST_CJS, "relayer-sdk.node-worker.cjs"))).toBe(false);
  });

  it("node worker file exists in ESM output", () => {
    expect(existsSync(resolve(DIST_ESM, "relayer-sdk.node-worker.js"))).toBe(true);
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
