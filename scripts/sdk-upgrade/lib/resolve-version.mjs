// Version resolution for the SDK-upgrade pipeline (SDK-208).
//
// Turns a user-supplied `--from`/`--to` spec into a concrete published version
// plus the git tag that carries its committed artifacts. A spec is either an
// exact version (`3.1.0-alpha.5`) or a dist-tag (`latest`, `alpha`). Dist-tags
// resolve via the npm registry's `dist-tags` map — never "newest publish time",
// which was a #316 bug (a republished older version would win).

import { parseVersion } from "./semver.mjs";

const REGISTRY = "https://registry.npmjs.org";

/** Classify a spec without touching the network. Pure — unit-tested. */
export function classifySpec(spec) {
  const trimmed = String(spec).trim();
  if (parseVersion(trimmed)) return { kind: "exact", value: trimmed };
  if (/^[a-z][a-z0-9-]*$/i.test(trimmed)) return { kind: "dist-tag", value: trimmed };
  throw new Error(`Unrecognised version spec: ${spec}`);
}

/** Git tag carrying a version's committed artifacts (llms-full, api reports). */
export function gitRefForVersion(version) {
  return `v${version}`;
}

// Registry document fetcher, injectable so resolveVersion stays testable offline.
async function fetchPackument(pkg, fetchImpl) {
  const res = await fetchImpl(`${REGISTRY}/${pkg.replace("/", "%2F")}`);
  if (!res.ok) {
    throw new Error(`Registry fetch failed for ${pkg}: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Resolve a spec to `{ version, gitRef, source }`.
 * `source` is "exact" or the dist-tag name it came from.
 */
export async function resolveVersion(spec, { pkg = "@zama-fhe/sdk", fetchImpl = fetch } = {}) {
  const classified = classifySpec(spec);
  if (classified.kind === "exact") {
    return { version: classified.value, gitRef: gitRefForVersion(classified.value), source: "exact" };
  }
  const packument = await fetchPackument(pkg, fetchImpl);
  const version = packument["dist-tags"]?.[classified.value];
  if (!version) {
    const available = Object.keys(packument["dist-tags"] ?? {}).join(", ") || "(none)";
    throw new Error(`No dist-tag "${classified.value}" on ${pkg}. Available: ${available}`);
  }
  return { version, gitRef: gitRefForVersion(version), source: classified.value };
}
