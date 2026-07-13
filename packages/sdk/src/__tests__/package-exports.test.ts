import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

describe("package exports", () => {
  test("exposes the Node CommonJS artifact to require consumers", () => {
    const packagePath = fileURLToPath(new URL("../../package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
      exports: Record<string, { require?: { types?: string; default?: string } }>;
    };

    expect(pkg.exports["./node"]?.require).toEqual({
      types: "./dist/esm/node/index.d.ts",
      default: "./dist/cjs/node/index.cjs",
    });
  });
});
