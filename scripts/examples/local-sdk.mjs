// Installs the workspace build of @zama-fhe/sdk and @zama-fhe/react-sdk into example apps without touching their
// package.json or lockfile, so the committed pins stay copy-pasteable.
// Tarballs, not links: a link would pull a second copy of React or viem into the example.
// A later `npm ci` in the example restores the published versions.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { listExamples, sdkPackages } from "./examples.mjs";

const usage = `Usage:
  node scripts/examples/local-sdk.mjs [example...]               build, pack and install (all examples by default)
  node scripts/examples/local-sdk.mjs --pack <dir>                build and pack into <dir> only
  node scripts/examples/local-sdk.mjs --from <dir> [example...]   install tarballs already in <dir>
  node scripts/examples/local-sdk.mjs --help                       print this help`;

const root = resolve(import.meta.dirname, "../..");

const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

function fail(message) {
  console.error(`${message}\n\n${usage}`);
  process.exit(1);
}

function pack(dir) {
  const filters = sdkPackages.flatMap((name) => ["--filter", name]);
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
  const tarballs = Object.keys(example.sdk).map((name) => tarballFor(dir, name));
  console.log(`\n${example.name}: installing ${tarballs.length} local SDK package(s)`);
  run("npm", ["install", "--no-save", ...tarballs], example.dir);
}

let parsed;
try {
  parsed = parseArgs({
    options: {
      pack: { type: "string" },
      from: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
    allowPositionals: true,
  });
} catch (error) {
  fail(error.message);
}
const { values, positionals } = parsed;

if (values.help) {
  console.log(usage);
  process.exit(0);
}

if (values.pack === "" || values.from === "") {
  fail("--pack and --from need a directory.");
}

if (values.pack !== undefined) {
  if (values.from !== undefined || positionals.length > 0) {
    fail("--pack takes no examples and cannot be combined with --from.");
  }
  pack(resolve(values.pack));
} else {
  const known = listExamples();
  const unknown = positionals.filter((name) => !known.some((example) => example.name === name));
  if (unknown.length > 0) {
    fail(
      `Unknown example: ${unknown.join(", ")}. Known: ${known.map(({ name }) => name).join(", ")}.`,
    );
  }
  const examples = positionals.length
    ? known.filter((example) => positionals.includes(example.name))
    : known;

  if (values.from !== undefined && !existsSync(resolve(values.from))) {
    fail(`--from directory not found: ${values.from}`);
  }
  const dir = values.from ? resolve(values.from) : mkdtempSync(join(tmpdir(), "zama-local-sdk-"));
  if (!values.from) {
    pack(dir);
  }
  for (const example of examples) {
    install(dir, example);
  }
}
