// Pins each example to a published SDK release, keeping each dependency's ^, ~ or exact range style.
// Does nothing unless the version is npm `latest` for every SDK package, so re-running an old release never downgrades the pins.
// In GitHub Actions it sets the `changed` step output.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { listExamples, sdkPackages } from "./examples.mjs";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/examples/bump-sdk.mjs <version>");
  process.exit(1);
}

function npmView(...args) {
  try {
    return execFileSync("npm", ["view", ...args], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function setChanged(changed) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed}\n`);
  }
}

// The registry can lag the publish, and the lockfile update resolves the new version from it.
async function waitForRelease() {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (sdkPackages.every((name) => npmView(`${name}@${version}`, "version") === version)) {
      return;
    }
    await sleep(20_000);
  }
  throw new Error(`${sdkPackages.join(" and ")} ${version} did not appear on npm.`);
}

await waitForRelease();

const notLatest = sdkPackages
  .map((name) => {
    const latest = npmView(name, "dist-tags.latest");
    if (!latest) {
      throw new Error(`Could not read the npm latest tag of ${name}.`);
    }
    return [name, latest];
  })
  .filter(([, latest]) => latest !== version);
if (notLatest.length > 0) {
  const tags = notLatest.map(([name, latest]) => `${name} is ${latest}`).join(", ");
  console.log(`Not pinning ${version}: it is not npm latest (${tags}).`);
  setChanged(false);
  process.exit(0);
}

let changed = false;
for (const example of listExamples()) {
  const ranges = Object.fromEntries(
    Object.entries(example.sdk).map(([name, range]) => [
      name,
      `${range.match(/^[\^~]?/)[0]}${version}`,
    ]),
  );
  if (Object.entries(ranges).every(([name, range]) => example.sdk[name] === range)) {
    console.log(`${example.name}: already on ${version}`);
    continue;
  }

  console.log(
    `${example.name}: pinning ${Object.entries(ranges)
      .map(([name, range]) => `${name}@${range}`)
      .join(", ")}`,
  );
  const manifest = JSON.parse(readFileSync(example.manifest, "utf8"));
  Object.assign(manifest.dependencies, ranges);
  writeFileSync(example.manifest, `${JSON.stringify(manifest, null, 2)}\n`);
  execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts"], {
    cwd: example.dir,
    stdio: "inherit",
  });
  changed = true;
}
setChanged(changed);
