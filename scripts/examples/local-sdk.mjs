// Installs the workspace build of @zama-fhe/sdk and @zama-fhe/react-sdk into example apps without touching their
// package.json or lockfile, so the committed pins stay copy-pasteable.
// Tarballs, not links: a link would pull a second copy of React or viem into the example.
// A later `npm ci` in the example restores the published versions.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

const usage = `Usage:
  node scripts/examples/local-sdk.mjs [example...]               build, pack and install (all examples by default)
  node scripts/examples/local-sdk.mjs --pack <dir>                build and pack into <dir> only
  node scripts/examples/local-sdk.mjs --from <dir> [example...]   install tarballs already in <dir>`;

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

let parsed;
try {
  parsed = parseArgs({
    options: { pack: { type: "string" }, from: { type: "string" } },
    allowPositionals: true,
  });
} catch (error) {
  console.error(`${error.message}\n\n${usage}`);
  process.exit(1);
}
const { values, positionals } = parsed;

if (values.pack) {
  pack(resolve(values.pack));
} else {
  const dir = values.from ? resolve(values.from) : mkdtempSync(join(tmpdir(), "zama-local-sdk-"));
  if (!values.from) {
    pack(dir);
  }
  const examples = positionals.length
    ? positionals
    : readdirSync(examplesDir).filter((name) =>
        existsSync(join(examplesDir, name, "package.json")),
      );
  for (const example of examples) {
    install(dir, example);
  }
}
