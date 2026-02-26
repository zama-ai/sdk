import { readFileSync, writeFileSync } from "node:fs";

const nextVersion = process.argv[2];

if (!nextVersion) {
  console.error("Usage: node scripts/release/prepare-lockstep.mjs <next-version>");
  process.exit(1);
}

const targets = ["packages/sdk/package.json", "packages/react-sdk/package.json"];

for (const path of targets) {
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = nextVersion;

  if (pkg.name === "@zama-fhe/react-sdk") {
    pkg.peerDependencies ||= {};
    pkg.peerDependencies["@zama-fhe/sdk"] = `^${nextVersion}`;
  }

  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
}

console.log(`Updated lockstep package versions to ${nextVersion}`);
