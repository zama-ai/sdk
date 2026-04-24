# Gotchas

Non-obvious things that have caused real bugs or friction.

- **TanStack `useQueries` wrapper is mandatory** in react-sdk. Never import `useQueries` directly from `@tanstack/react-query` — use the wrapper in `packages/react-sdk/src/utils/query.ts` which injects the custom `queryKeyHashFn`. An ast-grep rule enforces this.
- **Address normalization in query keys.** All addresses in query keys must use `getAddress()` for checksumming. Inconsistent casing causes cache misses.
- **Never delete or rename `main`, `prerelease`, or `release/*` branches locally** — they're shared across worktrees and tooling. If a tool needs a specific branch name for verification, use a throwaway name or a `/tmp` clone.
- **PR base defaults to `prerelease`**, not `main`. `main` is reserved for release/CI infrastructure PRs (`.releaserc*`, `scripts/release/`, release workflows). Product and feature work targets `prerelease`.
