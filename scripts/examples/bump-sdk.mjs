// Pins each example to a published SDK release, keeping its ^, ~ or exact range style.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/examples/bump-sdk.mjs <version>");
  process.exit(1);
}

const examplesDir = resolve(import.meta.dirname, "../../examples");
const packages = ["@zama-fhe/sdk", "@zama-fhe/react-sdk"];

for (const example of readdirSync(examplesDir)) {
  const cwd = join(examplesDir, example);
  const manifest = join(cwd, "package.json");
  if (!existsSync(manifest)) {
    continue;
  }

  const { dependencies = {} } = JSON.parse(readFileSync(manifest, "utf8"));
  const pinned = packages.filter((name) => name in dependencies);
  if (pinned.length === 0) {
    continue;
  }

  const prefix = /^[\^~]/.test(dependencies[pinned[0]]) ? dependencies[pinned[0]][0] : "";
  if (pinned.every((name) => dependencies[name] === `${prefix}${version}`)) {
    console.log(`${example}: already on ${version}`);
    continue;
  }

  console.log(`${example}: pinning ${pinned.join(", ")} to ${prefix}${version}`);
  execFileSync(
    "npm",
    [
      "install",
      "--package-lock-only",
      "--ignore-scripts",
      prefix ? `--save-prefix=${prefix}` : "--save-exact",
      ...pinned.map((name) => `${name}@${version}`),
    ],
    { cwd, stdio: "inherit" },
  );
}
