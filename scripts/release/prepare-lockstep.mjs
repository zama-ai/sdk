import { readFileSync, writeFileSync } from "node:fs";
import { goModulePath } from "./go-module.mjs";

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const nextVersion = process.argv[2];

if (!nextVersion) {
  console.error("Usage: node scripts/release/prepare-lockstep.mjs <next-version>");
  process.exit(1);
}

const targets = [
  "packages/sdk/package.json",
  "packages/react-sdk/package.json",
  "packages/sdk-daemon/package.json",
];

for (const path of targets) {
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = nextVersion;

  if (pkg.name === "@zama-fhe/react-sdk") {
    pkg.peerDependencies ||= {};
    pkg.peerDependencies["@zama-fhe/sdk"] = `^${nextVersion}`;
  }

  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

const crateTargets = [
  ["clients/rust/Cargo.toml", /^version = ".*"$/m, `version = "${nextVersion}"`],
  ["clients/rust/Cargo.lock", /^(name = "zama_sdk"\nversion = )".*"$/m, `$1"${nextVersion}"`],
];

for (const [path, pattern, replacement] of crateTargets) {
  const source = readFileSync(path, "utf8");
  if (!pattern.test(source)) {
    throw new Error(`No zama_sdk version found in ${path}`);
  }
  writeFileSync(path, source.replace(pattern, replacement), "utf8");
}

// Install commands in the Go and Rust docs pin the release they ship with.
const docTargets = [
  [
    "docs/gitbook/src/native/tutorials/go-quick-start.md",
    /^export ZAMA_SDK_VERSION=\S+$/gm,
    `export ZAMA_SDK_VERSION=${nextVersion}`,
  ],
  [
    "docs/gitbook/src/native/tutorials/rust-quick-start.md",
    /^export ZAMA_SDK_VERSION=\S+$/gm,
    `export ZAMA_SDK_VERSION=${nextVersion}`,
  ],
  [
    "docs/gitbook/src/native/operations/run-in-production.md",
    /^export ZAMA_SDK_VERSION=\S+$/gm,
    `export ZAMA_SDK_VERSION=${nextVersion}`,
  ],
  [
    "clients/go/README.md",
    new RegExp(`(go get ${escapeRegExp(goModulePath(nextVersion))}@v)\\S+`, "g"),
    `$1${nextVersion}`,
  ],
  ["clients/rust/README.md", /(cargo add zama_sdk@=)\S+/g, `$1${nextVersion}`],
  [
    "packages/sdk-daemon/README.md",
    /^export ZAMA_SDK_VERSION=\S+$/gm,
    `export ZAMA_SDK_VERSION=${nextVersion}`,
  ],
];

for (const [path, pattern, replacement] of docTargets) {
  const source = readFileSync(path, "utf8");
  if (!source.match(pattern)) {
    throw new Error(`No pinned SDK version found in ${path}`);
  }
  writeFileSync(path, source.replace(pattern, replacement), "utf8");
}

console.log(`Updated lockstep package, crate and docs versions to ${nextVersion}`);
