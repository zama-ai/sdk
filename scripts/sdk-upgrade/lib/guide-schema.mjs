// Migration-guide schema + selection for the SDK-upgrade pipeline (SDK-208).
//
// The guide is the *convergence artifact*: generated once per (A,B) couple,
// reviewed, committed, then applied identically to every app. validateGuide is
// the deterministic gate between the generate skill (Half 1) and commit — it
// rejects a malformed guide before it can be applied. Pure; unit-tested.

import { compareVersions } from "./semver.mjs";

export const SCHEMA_VERSION = 1;

const CHANGE_KINDS = new Set([
  "rename",
  "signature-change",
  "new-required-option",
  "removed-api",
  "new-api",
  "adopt-hook",
  "config-change",
]);
const SEVERITIES = new Set(["required", "recommended"]);
const REQUIRED_CHANGE_FIELDS = [
  "id",
  "kind",
  "appliesTo",
  "from",
  "to",
  "detection",
  "action",
  "severity",
];

const isNil = (v) => v === undefined || v === null;

/** Validate a parsed guide object. Returns `{ ok, errors }` — never throws. */
export function validateGuide(guide) {
  const errors = [];
  const push = (msg) => errors.push(msg);

  if (isNil(guide) || typeof guide !== "object") {
    return { ok: false, errors: ["guide is not an object"] };
  }
  if (guide.schemaVersion !== SCHEMA_VERSION) {
    push(`schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(guide.schemaVersion)}`);
  }
  for (const field of ["from", "to"]) {
    if (typeof guide[field] !== "string" || guide[field].length === 0) {
      push(`"${field}" must be a non-empty string`);
    }
  }
  if (!Array.isArray(guide.changes)) {
    push(`"changes" must be an array`);
    return { ok: errors.length === 0, errors };
  }

  const ids = new Set();
  guide.changes.forEach((change, i) => {
    const at = `changes[${i}]`;
    if (isNil(change) || typeof change !== "object") {
      push(`${at} is not an object`);
      return;
    }
    for (const field of REQUIRED_CHANGE_FIELDS) {
      if (isNil(change[field]) || change[field] === "") {
        push(`${at}.${field} is missing`);
      }
    }
    if (!isNil(change.id)) {
      if (ids.has(change.id)) {
        push(`${at}.id "${change.id}" is duplicated`);
      }
      ids.add(change.id);
    }
    if (!isNil(change.kind) && !CHANGE_KINDS.has(change.kind)) {
      push(`${at}.kind "${change.kind}" is not one of ${[...CHANGE_KINDS].join(", ")}`);
    }
    if (!isNil(change.severity) && !SEVERITIES.has(change.severity)) {
      push(`${at}.severity "${change.severity}" is not one of ${[...SEVERITIES].join(", ")}`);
    }
    if (!isNil(change.references) && !Array.isArray(change.references)) {
      push(`${at}.references must be an array when present`);
    }
  });

  return { ok: errors.length === 0, errors };
}

/**
 * Pick the guide to apply for an app at `installedVersion` targeting `targetVersion`.
 * Chooses the guide whose `to` matches the target and whose `from` is the nearest
 * published version **≤** the installed version (a guide covering an older floor
 * is idempotent on a slightly newer app). Returns null when none qualifies.
 */
export function selectGuide(installedVersion, targetVersion, guides) {
  const candidates = guides
    .filter((g) => g.to === targetVersion && compareVersions(g.from, installedVersion) <= 0)
    .toSorted((a, b) => compareVersions(b.from, a.from)); // nearest floor first
  return candidates[0] ?? null;
}
