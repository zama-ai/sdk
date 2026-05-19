# packages/react-sdk/AGENTS.md

React-specific guidance for `@zama-fhe/react-sdk`. Merges with the root [`AGENTS.md`](../../AGENTS.md) and [`docs/agents/`](../../docs/agents/) when you're working under this package. `CLAUDE.md` here is a symlink to this file.

## Hook design

- **Three-layer architecture.** Core async action (in `packages/sdk/src/query/`) → TanStack Query options factory → React hook. All new hooks must follow this layering. The `tanstack-best-practices` skill (installed by `pnpm setup:claude`) documents the full pattern, including query-key design, mutation patterns, and cache invalidation.
- **Generic hooks omit the domain.** `useRevokePermits`, not `useRevokeTokensPermits`. `useGrantPermit`, not `useGrantTokenPermit`. These work against any confidential contract type — matching the SDK-level "contracts" naming.
- **Token-specific hooks include the domain.** `useConfidentialBalance`, `useConfidentialTransfer`, `useShield`, `useUnshield`. These are explicitly token-flavoured operations.
- **First decrypt requires an explicit user click.** The first EIP-712 blind sign per session must be triggered by user action (e.g. a "Decrypt Balance" button). Gate initial decrypt queries with `enabled: false` until the user opts in. After that, cached credentials let subsequent decrypts run automatically on re-render.
- **`useShield` is the only shield hook product code should reach for.** It validates the underlying ERC-20 balance, manages approvals when required, and submits the shield in one call. The SDK routes between `transferAndCall` (ERC-1363 underlyings, single tx) and `approve` + `wrap` (everything else, two txs) under the hood, so the caller never picks the path. `useApproveUnderlying` is a low-level escape hatch for pre-approving outside a shield call — don't combine it with a manual `wrap` to recreate `useShield` by hand.
- **`unshield` vs `unwrap` hooks.** Prefer the `unshield/*` hooks in product code — they orchestrate the full two-phase request-then-finalize flow. The `unwrap/*` hooks are low-level building blocks exposed for custom flows; reach for them only when you need control over each phase.

## Gotchas

- **TanStack `useQueries` wrapper is mandatory.** Never import `useQueries` directly from `@tanstack/react-query` — use the wrapper in `packages/react-sdk/src/utils/query.ts`, which injects the custom `queryKeyHashFn` needed for bigint-friendly keys. An ast-grep rule enforces this.
- **`"use client"` directive on every hook/component file.** All hook and component source files in `packages/react-sdk/src/` must start with `"use client"` (RSC compatibility). Barrel exports, internal utilities, and pure adapter modules without React are exempt.
