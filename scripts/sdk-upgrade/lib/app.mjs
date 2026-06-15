// App locator + deterministic gates for the SDK-upgrade pipeline (SDK-208).
//
// The "apply" half of the pipeline brackets the LLM edit step with deterministic
// steps: read the app's pinned SDK version (to select the guide), bump the pins
// after edits, and typecheck against the target as the safety net that catches
// what the LLM missed. The pin-rewrite and version-read are pure-ish and tested;
// install/typecheck shell out and are exercised by the convergence run.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const SDK_PACKAGES = ["@zama-fhe/sdk", "@zama-fhe/react-sdk"];

export function repoRoot() {
  return new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
}

export function exampleDir(name) {
  return join(repoRoot(), "examples", name);
}

/** Read the highest pinned SDK version across known dep fields, or null. */
export function readInstalledVersion(appDir, packages = SDK_PACKAGES) {
  const pkgPath = join(appDir, "package.json");
  if (!existsSync(pkgPath)) {
    throw new Error(`No package.json at ${pkgPath}`);
  }
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of packages) {
      const raw = pkg[field]?.[name];
      if (raw) {
        return stripRange(raw);
      }
    }
  }
  return null;
}

/** Strip a leading semver range operator (`^`, `~`, `>=`) from a pin. */
export function stripRange(spec) {
  return String(spec)
    .replace(/^[\^~>=<\s]+/, "")
    .trim();
}

/**
 * Rewrite every SDK dependency pin in the app's package.json to `toVersion`.
 * Returns the list of `{ field, name, from, to }` changes (empty = nothing to do).
 */
export function bumpDeps(appDir, toVersion, packages = SDK_PACKAGES) {
  const pkgPath = join(appDir, "package.json");
  const text = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(text);
  const changes = [];
  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of packages) {
      const current = pkg[field]?.[name];
      if (current && stripRange(current) !== toVersion) {
        changes.push({ field, name, from: current, to: toVersion });
        pkg[field][name] = toVersion;
      }
    }
  }
  if (changes.length > 0) {
    // Preserve trailing newline convention.
    const trailing = text.endsWith("\n") ? "\n" : "";
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}${trailing}`);
  }
  return changes;
}
