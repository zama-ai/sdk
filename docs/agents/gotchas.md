# Gotchas

Non-obvious things that have caused real bugs or friction.

- **Address normalization in query keys.** All addresses in query keys must use `getAddress()` for checksumming. Inconsistent casing causes cache misses.
- **Never delete or rename `main`, `beta`, `alpha`, or `release/*` branches locally** — they're shared across worktrees and tooling. If a tool needs a specific branch name for verification, use a throwaway name or a `/tmp` clone.
- **PR base defaults to `beta`**, not `main`. `main` is reserved for release/CI infrastructure PRs (`.releaserc*`, `scripts/release/`, release workflows). Product and feature work targets `beta`; `alpha` is a protected branch used only to test protocol-breaking changes (synced from `beta`, merged back once stable), not a feature-PR target.
- **`storage` and `permitStorage` can safely share one backing store.** Transport-key-pair and permit keys are namespaced internally (`keypair:*` vs `permits:*`), so one shared `IndexedDBStorage` instance never collides — and it's the SDK's own default when `permitStorage` is omitted. Don't add a "must use separate stores" warning; it isn't true.
- **Chain reads live on `GenericProvider`, wallet writes on `GenericSigner`.** Custom adapters must split read- vs write-side responsibilities across the two interfaces or the SDK's routing breaks.
- **`signTypedData`: strip `EIP712Domain` from `types` before calling the wallet client.** Viem injects it automatically from the `domain` field — passing it in `types` causes a signature mismatch that surfaces as a credential rejection at decrypt time.
- **Subpath exports are public — but not every symbol is.** `package.json#exports` keys (`./query`, `./node`, …) are real entry points: a `/query` `*QueryOptions` factory is public API, so renaming one is a breaking change, not a tidy-up. But subpaths also leak internal types — those stay under the "internal is fine" rule. Judge by the documented surface, not the api-report.

- **GitBook internal links must be relative `.md`, never host-absolute.** Write `](../reference/sdk/Token.md)`, not `](/reference/sdk/Token)`. GitBook publishes each space under a sub-path (`docs.zama.org/protocol/sdk/…`), so a leading-slash link resolves against the site root, misses the space, and renders as a broken external GitHub URL → page-not-found. Such breakage only surfaces on the live site (verify rendering with GitBook's per-PR preview). Anchors must match a heading in the target page (GitBook slugifies `decryption.decryptValues` → `#decryption-decryptvalues`). `pnpm docs:check-links` enforces both rules and runs in CI.

> React-sdk has its own gotchas (TanStack `useQueries` wrapper, etc.) — see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).
