// Minimal semver comparison for the SDK-upgrade pipeline (SDK-208).
//
// We only ever compare versions this repo actually publishes: `X.Y.Z` and
// `X.Y.Z-alpha.N`. A full semver dependency would be overkill, so this handles
// just that shape. Prerelease (`-alpha.N`) sorts *below* its release (per semver),
// and prerelease identifiers compare numerically when both numeric.

const PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** Parse `X.Y.Z[-pre]` into `{ major, minor, patch, pre }`, or null if malformed. */
export function parseVersion(version) {
  const match = PATTERN.exec(String(version).trim());
  if (!match) return null;
  const [, major, minor, patch, pre] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    pre: pre ? pre.split(".") : [],
  };
}

function comparePre(a, b) {
  // No prerelease outranks a prerelease: 1.0.0 > 1.0.0-alpha.1.
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    if (i >= a.length) return -1; // a is a prefix of b -> a is lower
    if (i >= b.length) return 1;
    const ai = a[i];
    const bi = b[i];
    const an = /^\d+$/.test(ai);
    const bn = /^\d+$/.test(bi);
    if (an && bn) {
      const d = Number(ai) - Number(bi);
      if (d !== 0) return Math.sign(d);
    } else if (an !== bn) {
      return an ? -1 : 1; // numeric identifiers are lower than alphanumeric
    } else if (ai !== bi) {
      return ai < bi ? -1 : 1;
    }
  }
  return 0;
}

/** Compare two versions. Returns -1, 0, or 1. Throws on malformed input. */
export function compareVersions(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa) throw new Error(`Unparseable version: ${a}`);
  if (!pb) throw new Error(`Unparseable version: ${b}`);
  for (const key of ["major", "minor", "patch"]) {
    const d = pa[key] - pb[key];
    if (d !== 0) return Math.sign(d);
  }
  return comparePre(pa.pre, pb.pre);
}
