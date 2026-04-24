# packages/react-sdk/AGENTS.md

React-specific guidance for `@zama-fhe/react-sdk`. Merges with the root [`AGENTS.md`](../../AGENTS.md) and [`docs/agents/`](../../docs/agents/) when you're working under this package. `CLAUDE.md` here is a symlink to this file.

## Hook design

- **Three-layer architecture.** Core async action (in `packages/sdk/src/query/`) → TanStack Query options factory → React hook. All new hooks must follow this layering. The `tanstack-best-practices` skill (installed by `pnpm setup:claude`) documents the full pattern, including query-key design, mutation patterns, and cache invalidation.
- **Generic hooks omit the domain.** `useRevoke`, not `useRevokeTokens`. `useAllow`, not `useAllowTokens`. These work against any confidential contract type — matching the SDK-level "contracts" naming.
- **Token-specific hooks include the domain.** `useConfidentialBalance`, `useConfidentialTransfer`, `useShield`, `useUnshield`. These are explicitly token-flavoured operations.
- **First decrypt requires an explicit user click.** The first EIP-712 blind sign per session must be triggered by user action (e.g. a "Decrypt Balance" button). Gate initial decrypt queries with `enabled: false` until the user opts in. After that, cached credentials let subsequent decrypts run automatically on re-render.

## Gotchas

- **TanStack `useQueries` wrapper is mandatory.** Never import `useQueries` directly from `@tanstack/react-query` — use the wrapper in `packages/react-sdk/src/utils/query.ts`, which injects the custom `queryKeyHashFn` needed for bigint-friendly keys. An ast-grep rule (`tools/ast-grep/rules/no-direct-tanstack-useQueries.yml`) enforces this.
