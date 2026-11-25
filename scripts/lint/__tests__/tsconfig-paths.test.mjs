import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const readJson = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));

const packages = ["sdk", "react-sdk"].map((dir) => readJson(`packages/${dir}/package.json`));

// TypeScript resolves these specifiers from source; anything else must fail typecheck.
const exportedSpecifiers = packages.flatMap(({ name, exports }) =>
  Object.keys(exports)
    .filter((subpath) => !/\.(js|json)$/.test(subpath))
    .map((subpath) => (subpath === "." ? name : `${name}/${subpath.slice(2)}`)),
);

describe.each(["tsconfig.json", "test/test-nextjs/tsconfig.json"])("%s paths", (file) => {
  const { paths } = readJson(file).compilerOptions;
  const ownPaths = Object.keys(paths).filter((key) => key.startsWith("@zama-fhe/"));

  it("lists exactly the package exports", () => {
    expect(new Set(ownPaths)).toEqual(new Set(exportedSpecifiers));
  });

  it("points every entry at an existing file", () => {
    const missing = ownPaths.filter(
      (key) => !existsSync(resolve(root, dirname(file), paths[key][0])),
    );
    expect(missing).toEqual([]);
  });
});
