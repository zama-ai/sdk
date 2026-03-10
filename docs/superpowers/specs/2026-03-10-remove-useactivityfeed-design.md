# Design: Remove `useActivityFeed` from SDK

**Issue:** [SDK-26](https://linear.app/zama/issue/SDK-26/refactor-remove-useactivityfeed-from-sdk)
**Date:** 2026-03-10

## Summary

`useActivityFeed` and its supporting logic (`parseActivityFeed`, `extractEncryptedHandles`, `applyDecryptedValues`, `sortByBlockNumber`) are app-specific and don't belong in a public SDK. This design moves them to `packages/test-components/` — the internal package that already consumes them via `ActivityFeedPanel`.

## What moves to `test-components`

All activity feed code moves to `packages/test-components/src/activity-feed/`:

| Current location | New location |
|-----------------|-------------|
| `packages/sdk/src/activity.ts` | `packages/test-components/src/activity-feed/activity.ts` |
| `packages/react-sdk/src/token/use-activity-feed.ts` | `packages/test-components/src/activity-feed/use-activity-feed.ts` |
| `packages/sdk/src/__tests__/activity.test.ts` | `packages/test-components/src/activity-feed/__tests__/activity.test.ts` |
| `packages/react-sdk/src/token/__tests__/use-activity-feed.test.tsx` | `packages/test-components/src/activity-feed/__tests__/use-activity-feed.test.tsx` |

## What stays in core SDK

These are shared by other SDK features and remain untouched:

- `RawLog`, `OnChainEvent`, all specific event types (used by token.ts, viem/ethers adapters)
- `decodeOnChainEvent()`, `decodeOnChainEvents()` (general-purpose event decoders)
- `findUnwrapRequested()`, `findWrapped()` (used by core token.ts)
- `Topics` / `TOKEN_TOPICS` constants
- `Handle` type

## What is removed entirely

- `packages/sdk/src/query/activity-feed.ts` — query factory (inlined into the hook)
- `packages/sdk/src/query/__tests__/activity-feed.test.ts` — query factory tests
- `zamaQueryKeys.activityFeed` entries in `packages/sdk/src/query/query-keys.ts`
- `zamaQueryKeys.activityFeed` invalidation calls in `packages/sdk/src/query/invalidation.ts` (remove from `invalidateAfterShield`, `invalidateAfterTransfer`, `invalidateAfterUnshield`, `invalidateAfterApprove`)
- All activity-feed re-exports from `packages/sdk/src/index.ts`
- All activity-feed re-exports from `packages/sdk/src/query/index.ts`
- All activity-feed re-exports from `packages/react-sdk/src/index.ts` (including `useActivityFeed`, `UseActivityFeedConfig`, `activityFeedQueryOptions`, `ActivityFeedConfig`, `ActivityFeedQueryConfig`, `ActivityDirection`, `ActivityType`, `ActivityAmount`, `ActivityLogMetadata`, `ActivityItem`, `parseActivityFeed`, `extractEncryptedHandles`, `applyDecryptedValues`, `sortByBlockNumber`)

**Test files to update:**

- `packages/sdk/src/query/__tests__/query-keys.test.ts` — remove `activityFeed` test cases
- `packages/sdk/src/query/__tests__/invalidation.test.ts` — remove `activityFeed` assertions
- `packages/react-sdk/src/token/__tests__/use-confidential-transfer.test.tsx` — remove `activityFeed` key assertions
- `packages/react-sdk/src/token/__tests__/use-confidential-transfer-from.test.tsx` — remove `activityFeed` key assertion

## New file structure

```
packages/test-components/src/activity-feed/
├── activity.ts                    # parseActivityFeed, extractEncryptedHandles,
│                                  # applyDecryptedValues, sortByBlockNumber + types
├── use-activity-feed.ts           # useActivityFeed hook (inlines query logic)
├── __tests__/
│   ├── activity.test.ts
│   └── use-activity-feed.test.tsx
└── index.ts                       # barrel export
```

## Hook changes

The current `useActivityFeed` depends on `activityFeedQueryOptions` from `@zama-fhe/sdk/query`. Since that query factory is being removed, the hook will inline the query logic directly — a `useQuery` call with parse/decrypt as the query function. This removes the dependency on SDK query keys.

The moved code still imports from `@zama-fhe/sdk` (via `@zama-fhe/react-sdk`'s re-exports):
- `decodeOnChainEvent` (for parsing raw logs)
- `RawLog`, `OnChainEvent` types
- `Handle`, `ZERO_HANDLE`
- `ReadonlyToken` (for decrypt in the hook)

## Dependency changes in `test-components`

`test-components` already has `@zama-fhe/react-sdk` as a peer dependency, which re-exports all needed core SDK types (`RawLog`, `decodeOnChainEvent`, `Handle`, etc.). The moved code will import these through `@zama-fhe/react-sdk`, so no new dependency on `@zama-fhe/sdk` is needed.

`@tanstack/react-query` is already available to `test-components` as a transitive peer dependency of `@zama-fhe/react-sdk`. The hook will import `useQuery` from `@tanstack/react-query` directly — add it as a peer dependency in `test-components/package.json`.

## Export cleanup

- `packages/sdk/src/index.ts` — remove `parseActivityFeed`, `extractEncryptedHandles`, `applyDecryptedValues`, `sortByBlockNumber`, `ActivityItem`, `ActivityDirection`, `ActivityType`, `ActivityAmount`, `ActivityLogMetadata`
- `packages/sdk/src/query/index.ts` — remove `activityFeedQueryOptions`, `ActivityFeedConfig`, `ActivityFeedQueryConfig`
- `packages/sdk/src/query/query-keys.ts` — remove `activityFeed` section from `zamaQueryKeys`
- `packages/sdk/src/query/invalidation.ts` — remove `activityFeed` invalidation calls
- `packages/react-sdk/src/index.ts` — remove all activity feed re-exports (hook, types, functions, query options)
- API reports — regenerate both `packages/sdk/etc/sdk.api.md`, `packages/sdk/etc/sdk-query.api.md`, and `packages/react-sdk/etc/react-sdk.api.md` via `pnpm api-report`

## README updates

- `packages/sdk/README.md` — remove activity feed helpers section
- `packages/react-sdk/README.md` — remove `useActivityFeed` documentation, query keys table entry, and re-exported types references

## Breaking change

This is a breaking change for consumers importing activity feed symbols from `@zama-fhe/sdk` or `@zama-fhe/react-sdk`. Since the SDK is at alpha (1.0.0-alpha.17), breaking changes are expected. A migration note in the changelog is sufficient.

## Acceptance criteria

- `useActivityFeed` no longer exported from `@zama-fhe/react-sdk`
- Activity feed types and functions no longer exported from `@zama-fhe/sdk`
- Activity feed query factory and keys removed from `@zama-fhe/sdk/query`
- Activity feed invalidation calls removed from core SDK
- Activity feed logic lives in `packages/test-components/src/activity-feed/`
- `ActivityFeedPanel` works as before using local imports
- All remaining SDK and react-sdk tests pass
- API reports regenerated for both packages
- READMEs updated for both packages
- Migration note in changelog
