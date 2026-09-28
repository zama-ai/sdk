import { readFileSync, writeFileSync } from "node:fs";

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
  ["clients/rust/Cargo.lock", /^(name = "zama-sdk"\nversion = )".*"$/m, `$1"${nextVersion}"`],
];

for (const [path, pattern, replacement] of crateTargets) {
  const source = readFileSync(path, "utf8");
  if (!pattern.test(source)) {
    throw new Error(`No zama-sdk version found in ${path}`);
  }
  writeFileSync(path, source.replace(pattern, replacement), "utf8");
}

console.log(`Updated lockstep package and crate versions to ${nextVersion}`);
