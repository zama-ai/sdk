import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const condition = "@zama-fhe/source";
const readPackage = (dir) =>
  JSON.parse(readFileSync(resolve(root, "packages", dir, "package.json"), "utf8"));
// Subpaths with a file extension expose a built file, not a module entry, so they take no source condition.
const isFileSubpath = (subpath) => /\.(js|json)$/.test(subpath);

describe.each(["sdk", "react-sdk"])("packages/%s exports", (dir) => {
  const pkgDir = resolve(root, "packages", dir);
  const entries = Object.entries(readPackage(dir).exports).filter(([s]) => !isFileSubpath(s));

  // Conditions match in key order, so the source entry must come first to win.
  it.each(entries)("%s resolves its source condition first", (_subpath, target) => {
    expect(Object.keys(target)[0]).toBe(condition);
    expect(existsSync(resolve(pkgDir, target[condition]))).toBe(true);
  });
});

describe("packages/sdk typesVersions", () => {
  const { exports, typesVersions } = readPackage("sdk");
  const subpaths = Object.keys(exports).filter((s) => s !== "." && !isFileSubpath(s));

  it.each(subpaths)("%s has a typesVersions entry", (subpath) => {
    expect(Object.keys(typesVersions["*"])).toContain(subpath.slice(2));
  });
});
