// Installs the workspace build of @zama-fhe/sdk and @zama-fhe/react-sdk into example apps without touching their
// package.json or package-lock.json, so the committed pins stay copy-pasteable while we test unreleased SDK changes.
// Packed tarballs (not links) mirror what npm users get and avoid a second copy of React or viem in the example.
//
//   node scripts/examples/local-sdk.mjs [example...]               build, pack and install (all examples by default)
//   node scripts/examples/local-sdk.mjs --pack <dir>                build and pack into <dir> only
//   node scripts/examples/local-sdk.mjs --from <dir> [example...]   install tarballs already in <dir>
//
// A later `npm ci` or `npm install` in the example restores the published versions.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const examplesDir = join(root, "examples");
const packages = ["@zama-fhe/sdk", "@zama-fhe/react-sdk"];

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

function pack(dir) {
  const filters = packages.flatMap((name) => ["--filter", name]);
  run("pnpm", ["exec", "turbo", "run", "build", ...filters]);
  run("pnpm", [...filters, "pack", "--pack-destination", dir]);
}

// pnpm names tarballs <scope>-<name>-<version>.tgz.
function tarballFor(dir, name) {
  const prefix = `${name.replace("@", "").replace("/", "-")}-`;
  const matches = readdirSync(dir).filter((file) => file.startsWith(prefix));
  if (matches.length !== 1) {
    throw new Error(`Expected one ${prefix}*.tgz in ${dir}, found ${matches.length}`);
  }
  return join(dir, matches[0]);
}

function install(dir, example) {
  const cwd = join(examplesDir, example);
  const manifest = join(cwd, "package.json");
  if (!existsSync(manifest)) {
    throw new Error(`Unknown example: ${example}`);
  }
  const { dependencies = {} } = JSON.parse(readFileSync(manifest, "utf8"));
  const tarballs = packages
    .filter((name) => name in dependencies)
    .map((name) => tarballFor(dir, name));
  if (tarballs.length === 0) {
    throw new Error(`${example} does not depend on the SDK`);
  }
  console.log(`\n${example}: installing ${tarballs.length} local SDK package(s)`);
  run("npm", ["install", "--no-save", ...tarballs], cwd);
}

const args = process.argv.slice(2);
const flag = args[0]?.startsWith("--") ? args.shift() : undefined;

if (flag === "--pack") {
  if (!args[0]) {
    throw new Error("--pack needs a directory");
  }
  pack(resolve(args[0]));
} else {
  let dir;
  if (flag === "--from") {
    if (!args[0]) {
      throw new Error("--from needs a directory");
    }
    dir = resolve(args.shift());
  } else if (flag) {
    throw new Error(`Unknown flag: ${flag}`);
  } else {
    dir = mkdtempSync(join(tmpdir(), "zama-local-sdk-"));
    pack(dir);
  }
  const examples = args.length
    ? args
    : readdirSync(examplesDir).filter((name) =>
        existsSync(join(examplesDir, name, "package.json")),
      );
  for (const example of examples) {
    install(dir, example);
  }
}
