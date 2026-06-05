# Gotchas

Non-obvious things that have caused real bugs or friction.

- **Address normalization in query keys.** All addresses in query keys must use `getAddress()` for checksumming. Inconsistent casing causes cache misses.
- **Never delete or rename `main`, `prerelease`, or `release/*` branches locally** — they're shared across worktrees and tooling. If a tool needs a specific branch name for verification, use a throwaway name or a `/tmp` clone.
- **PR base defaults to `prerelease`**, not `main`. `main` is reserved for release/CI infrastructure PRs (`.releaserc*`, `scripts/release/`, release workflows). Product and feature work targets `prerelease`.
- **Storage and sessionStorage need distinct stores.** If you override the SDK's default `storage` (keypair persistence) and `sessionStorage` (credential cache), give them distinct backing stores. Sharing one store causes the session entry to overwrite the encrypted keypair, forcing a fresh EIP-712 sign on every decrypt. Omitting both is safe — the defaults are already separated.
- **Chain reads live on `GenericProvider`, wallet writes on `GenericSigner`.** Custom adapters must split read- vs write-side responsibilities across the two interfaces or the SDK's routing breaks.
- **`signTypedData`: strip `EIP712Domain` from `types` before calling the wallet client.** Viem injects it automatically from the `domain` field — passing it in `types` causes a signature mismatch that surfaces as a credential rejection at decrypt time.
- **Published subpaths are public API.** Each `package.json#exports` key (`./query`, `./node`, `./viem`, `./ethers`, `./web`, `./cleartext`, `./chains`) is a public entry point — the code-bearing ones have their own `etc/*.api.md` report. Anything they export is public surface and follows the same naming rules as the main entry: renaming an export there (e.g. a `*QueryOptions` / `*MutationOptions` factory) is a public API change, not an internal tidy-up. Don't treat `query/` or `node/` as "internal" just because they're plumbing.

> React-sdk has its own gotchas (TanStack `useQueries` wrapper, etc.) — see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).
