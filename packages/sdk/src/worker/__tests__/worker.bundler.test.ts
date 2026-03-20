/**
 * Build-level smoke tests for the worker bundling pipeline.
 *
 * These verify that `pnpm build` produces valid output:
 * - The standalone worker IIFE file exists
 * - The main bundle references CDN URLs (no co-located UMD)
 *
 * Run `pnpm build` before running these tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve(__dirname, "../../../dist/esm");
const hasBuild = existsSync(resolve(DIST, "relayer-sdk.worker.js"));

describe.skipIf(!hasBuild)("worker build smoke tests", () => {
  const workerPath = resolve(DIST, "relayer-sdk.worker.js");
  const indexPath = resolve(DIST, "index.js");

  it("dist/esm/relayer-sdk.worker.js exists", () => {
    expect(existsSync(workerPath)).toBe(true);
  });

  it("standalone worker file contains self.onmessage handler", () => {
    const content = readFileSync(workerPath, "utf-8");
    expect(content).toContain("onmessage");
  });

  it("main bundle references CDN URL for the UMD bundle", () => {
    const content = readFileSync(indexPath, "utf-8");
    expect(content).toContain("cdn.zama.org");
    expect(content).toContain("relayer-sdk-js.umd.cjs");
  });
});
