// Public-export extraction for the completeness lint.
//
// The generate step is LLM-driven and its variance lives in the long tail of
// public-API deltas it may or may not enumerate. To turn "did it cover every
// public change?" into a deterministic check, we mechanically pull the set of
// top-level public export identifiers that appear on changed lines of an
// api-extractor `.api.md` unified diff. Pure; unit-tested.

// Matches a top-level `export` declaration on an added/removed diff line and
// captures the declared identifier. Class members are indented (no `export`),
// so only top-level public surface is captured — the right granularity for a
// per-couple coverage checklist.
const EXPORT_DECL =
  /^[+-]\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:function|class|const|type|interface|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

/**
 * Identifiers of top-level public exports touched by a single `.api.md` diff.
 * Returns a sorted, de-duplicated array. An empty/whitespace diff yields `[]`.
 */
export function changedPublicExports(diffText) {
  const ids = new Set();
  if (!diffText) {
    return [];
  }
  for (const line of diffText.split("\n")) {
    // Skip the unified-diff file headers (`--- a/...`, `+++ b/...`).
    if (line.startsWith("+++") || line.startsWith("---")) {
      continue;
    }
    const match = EXPORT_DECL.exec(line);
    if (match) {
      ids.add(match[1]);
    }
  }
  return [...ids].toSorted((a, b) => a.localeCompare(b));
}
