// Completeness lint for the SDK-upgrade pipeline (SDK-208).
//
// Cross-checks a generated guide against the deterministic set of changed public
// export identifiers (from the api-report diffs): every such symbol should be
// named by at least one guide change. Surfaces the gaps as a review checklist —
// the lever that bounds the generate step's long-tail variance. Pure; unit-tested.

// A symbol counts as "covered" when its identifier appears anywhere a guide
// change could reference it: the old/new symbol text, the explicit symbol list,
// or the prose detection/action. Word-boundary match avoids substring false
// positives (e.g. `Token` inside `WrappedToken`).
function mentions(change, symbol) {
  const haystack = [
    change.from,
    change.to,
    change.detection,
    change.action,
    ...(Array.isArray(change.affectedSymbols) ? change.affectedSymbols : []),
  ]
    .filter((s) => typeof s === "string")
    .join("\n");
  return new RegExp(`(?<![\\w$])${escapeRegExp(symbol)}(?![\\w$])`).test(haystack);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Return the changed public symbols not referenced by any guide change.
 * `symbols` is the union of `changedPublicExports` across the api diffs.
 */
export function uncoveredSymbols(guide, symbols) {
  const changes = Array.isArray(guide?.changes) ? guide.changes : [];
  return symbols.filter((symbol) => !changes.some((change) => mentions(change, symbol)));
}
