/**
 * Build-level smoke tests for the worker bundling pipeline.
 *
 * These verify that `pnpm build` produces valid output:
 * - The standalone worker file exists and is valid IIFE
 * - The main bundle contains inlined worker code
 *
 * Run `pnpm build` before running these tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve(__dirname, "../../../dist");

describe("worker build smoke tests", () => {
  const workerPath = resolve(DIST, "relayer-sdk.worker.js");
  const indexPath = resolve(DIST, "index.js");

  it("dist/relayer-sdk.worker.js exists", () => {
    expect(existsSync(workerPath)).toBe(true);
  });

  it("standalone worker file is valid IIFE", () => {
    const content = readFileSync(workerPath, "utf-8");
    expect(content).toMatch(/^\(function\s*\(/);
  });

  it("standalone worker file contains self.onmessage handler", () => {
    const content = readFileSync(workerPath, "utf-8");
    expect(content).toContain("onmessage");
  });

  it("main bundle inlines the worker code", () => {
    const content = readFileSync(indexPath, "utf-8");
    // The inlined worker code should contain the IIFE as a string literal
    expect(content).toContain("onmessage");
  });

  it("standalone worker file exports filename alongside code", () => {
    const content = readFileSync(indexPath, "utf-8");
    expect(content).toContain("relayer-sdk.worker.js");
  });
});
