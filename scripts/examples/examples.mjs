// Lists the example apps and the SDK packages each one depends on.
// `node scripts/examples/examples.mjs --json` prints the list for the CI matrix.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const examplesDir = resolve(import.meta.dirname, "../../examples");
export const sdkPackages = ["@zama-fhe/sdk", "@zama-fhe/react-sdk"];

// An example is a directory in examples/ whose package.json depends on the SDK.
export function listExamples() {
  return readdirSync(examplesDir, { withFileTypes: true }).flatMap((entry) => {
    const dir = join(examplesDir, entry.name);
    const manifest = join(dir, "package.json");
    if (!entry.isDirectory() || !existsSync(manifest)) {
      return [];
    }
    const { dependencies = {}, scripts = {} } = JSON.parse(readFileSync(manifest, "utf8"));
    const sdk = Object.fromEntries(
      sdkPackages.filter((name) => name in dependencies).map((name) => [name, dependencies[name]]),
    );
    if (Object.keys(sdk).length === 0) {
      return [];
    }
    return [{ name: entry.name, dir, manifest, sdk, e2e: "test:e2e" in scripts }];
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "--json") {
    console.error("Usage: node scripts/examples/examples.mjs --json");
    process.exit(1);
  }
  console.log(JSON.stringify(listExamples().map(({ name, e2e }) => ({ name, e2e }))));
}
