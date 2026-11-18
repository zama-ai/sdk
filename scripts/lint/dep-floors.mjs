// Fails when a dependency bump leaves a sibling behind:
// - every package.json that declares a package with a `>=X` override in pnpm-workspace.yaml must use floor X;
// - eslint-config-next must use the same range as next in the same package.json.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");

function readFloorOverrides() {
  const text = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
  const block = text.match(/^overrides:\n((?:[ \t]+.*\n|\n)*)/m)?.[1];
  if (block === undefined) {
    throw new Error("pnpm-workspace.yaml: no overrides block found.");
  }
  const floors = new Map();
  for (const line of block.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) {
      continue;
    }
    const entry = line.match(/^\s+"?([^"]+?)"?:\s*"([^"]*)"\s*$/);
    if (!entry) {
      throw new Error(`pnpm-workspace.yaml: cannot parse override line: ${line.trim()}`);
    }
    const [, selector, range] = entry;
    // Only plain `name: ">=X"` overrides set a floor for every declared range. Selectors such
    // as `undici@^6.0.0` or bounded ranges only cover transitive versions, so they are skipped.
    const floor = range.match(/^>=(\d+\.\d+\.\d+)$/)?.[1];
    if (floor && /^(@[^/]+\/)?[^@]+$/.test(selector)) {
      floors.set(selector, floor);
    }
  }
  return floors;
}

function declaredFloor(range) {
  return range.match(/^[\^~]?(\d+\.\d+\.\d+)$/)?.[1];
}

const floors = readFloorOverrides();
const manifests = execFileSync("git", ["ls-files", "*package.json"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\n")
  .filter((path) => path.endsWith("package.json"));

const problems = [];
for (const path of manifests) {
  const manifest = JSON.parse(readFileSync(join(root, path), "utf8"));
  const deps = { ...manifest.dependencies, ...manifest.devDependencies };

  for (const [name, range] of Object.entries(deps)) {
    const floor = floors.get(name);
    if (floor && declaredFloor(range) !== floor) {
      problems.push(
        `${path}: ${name} is "${range}", but pnpm-workspace.yaml overrides it to ">=${floor}". Give the override and every package.json the same floor.`,
      );
    }
  }

  if (deps["eslint-config-next"] && deps.next && deps["eslint-config-next"] !== deps.next) {
    problems.push(
      `${path}: eslint-config-next is "${deps["eslint-config-next"]}" but next is "${deps.next}". Bump them together.`,
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
