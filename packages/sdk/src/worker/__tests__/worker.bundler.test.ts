/**
 * Build-level smoke tests for the worker bundling pipeline.
 *
 * These verify that `pnpm build` produces valid output:
 * - The standalone worker file exists and is valid IIFE
 * - The main bundle contains inlined worker code
 *
 * Run `pnpm build` before running these tests.
 */
import { describe, test, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const DIST = resolve(__dirname, "../../../dist");
const hasBuild = existsSync(resolve(DIST, "relayer-sdk.worker.js"));
const ESM_DIR = resolve(DIST, "esm");
const hasEsmBuild = existsSync(ESM_DIR);

describe.skipIf(!hasBuild)("worker build smoke tests", () => {
  const workerPath = resolve(DIST, "relayer-sdk.worker.js");
  const indexPath = resolve(DIST, "index.js");

  test("dist/relayer-sdk.worker.js exists", () => {
    expect(existsSync(workerPath)).toBe(true);
  });

  test("standalone worker file is valid IIFE", () => {
    const content = readFileSync(workerPath, "utf-8");
    expect(content).toMatch(/^\(function\s*\(/);
  });

  test("standalone worker file contains self.onmessage handler", () => {
    const content = readFileSync(workerPath, "utf-8");
    expect(content).toContain("onmessage");
  });

  test("main bundle inlines the worker code", () => {
    const content = readFileSync(indexPath, "utf-8");
    // The inlined worker code should contain the IIFE as a string literal
    expect(content).toContain("onmessage");
  });

  test("standalone worker file exports filename alongside code", () => {
    const content = readFileSync(indexPath, "utf-8");
    expect(content).toContain("relayer-sdk.worker.js");
  });
});

describe.skipIf(!hasEsmBuild)("node worker resolution is SSR-bundler safe (SDK-235)", () => {
  // `import.meta.resolve` is rewritten to `__vite_ssr_import_meta__.resolve` by
  // Vite's SSR transform (used by Ponder and other server-side bundlers), where
  // it is undefined at runtime — so the Node worker factory throws and can never
  // spawn its worker. No shipped ESM chunk may reference it, regardless of which
  // rolldown chunk the node worker client lands in.
  test("no shipped ESM chunk uses import.meta.resolve", () => {
    const files = readdirSync(ESM_DIR, { recursive: true }) as string[];
    const offenders = files
      .filter((file) => file.endsWith(".js"))
      .filter((file) =>
        readFileSync(resolve(ESM_DIR, file), "utf-8").includes("import.meta.resolve"),
      );
    expect(offenders).toEqual([]);
  });
});
