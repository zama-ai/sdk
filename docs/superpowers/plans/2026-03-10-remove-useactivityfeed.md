# Remove `useActivityFeed` from SDK — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove activity feed logic from the public SDK and move it to `test-components`.

**Architecture:** Copy activity parsing + React hook into `packages/test-components/src/activity-feed/`, then delete from `@zama-fhe/sdk` and `@zama-fhe/react-sdk`. Remove all related exports, query keys, invalidation calls, and tests. The moved code imports event types/decoders from `@zama-fhe/react-sdk` (which re-exports them from core SDK).

**Tech Stack:** TypeScript, React, TanStack React Query, vitest

**Spec:** `docs/superpowers/specs/2026-03-10-remove-useactivityfeed-design.md`

---

## File Structure

### New files (in `packages/test-components/src/activity-feed/`)
- `activity.ts` — copied from `packages/sdk/src/activity.ts`, imports adjusted
- `use-activity-feed.ts` — rewritten from `packages/react-sdk/src/token/use-activity-feed.ts`, inlines query logic
- `__tests__/activity.test.ts` — copied from `packages/sdk/src/__tests__/activity.test.ts`, imports adjusted
- `index.ts` — barrel export

### Modified files
- `packages/test-components/src/activity-feed-panel.tsx` — update imports
- `packages/test-components/package.json` — add `@tanstack/react-query` peer dep
- `packages/sdk/src/index.ts:166-179` — remove activity feed exports
- `packages/sdk/src/query/index.ts:72-76,101-102` — remove activity feed exports
- `packages/sdk/src/query/query-keys.ts:145-159` — remove `activityFeed` section
- `packages/sdk/src/query/invalidation.ts:30,46,53,58,72` — remove `activityFeed` invalidation lines
- `packages/react-sdk/src/index.ts:230,271,331-344` — remove activity feed exports
- `packages/sdk/src/query/__tests__/query-keys.test.ts` — remove `activityFeed` test cases
- `packages/sdk/src/query/__tests__/invalidation.test.ts` — remove `activityFeed` assertions
- `packages/react-sdk/src/token/__tests__/use-confidential-transfer.test.tsx` — remove `activityFeed` key assertions
- `packages/react-sdk/src/token/__tests__/use-confidential-transfer-from.test.tsx` — remove `activityFeed` key assertion

### Deleted files
- `packages/sdk/src/activity.ts`
- `packages/sdk/src/query/activity-feed.ts`
- `packages/sdk/src/__tests__/activity.test.ts`
- `packages/sdk/src/query/__tests__/activity-feed.test.ts`
- `packages/react-sdk/src/token/use-activity-feed.ts`
- `packages/react-sdk/src/token/__tests__/use-activity-feed.test.tsx`

---

## Chunk 1: Move activity feed code to test-components

### Task 1: Create `activity.ts` in test-components

**Files:**
- Create: `packages/test-components/src/activity-feed/activity.ts`

- [ ] **Step 1: Copy activity.ts with adjusted imports**

Create `packages/test-components/src/activity-feed/activity.ts` with the full content of `packages/sdk/src/activity.ts`, but change the imports to use `@zama-fhe/react-sdk` (which re-exports everything):

```typescript
import {
  decodeOnChainEvent,
  ZERO_HANDLE,
  type RawLog,
  type OnChainEvent,
  type ConfidentialTransferEvent,
  type WrappedEvent,
  type UnwrapRequestedEvent,
  type UnwrappedFinalizedEvent,
  type UnwrappedStartedEvent,
  type Handle,
} from "@zama-fhe/react-sdk";
```

Replace the three original import blocks (lines 10-21 of the original) with this single import. Keep the rest of the file identical.

- [ ] **Step 2: Commit**

```bash
git add packages/test-components/src/activity-feed/activity.ts
git commit -m "refactor: copy activity feed parsing logic to test-components"
```

---

### Task 2: Create `use-activity-feed.ts` in test-components

**Files:**
- Create: `packages/test-components/src/activity-feed/use-activity-feed.ts`

- [ ] **Step 1: Write the hook with inlined query logic**

The hook should NOT depend on `activityFeedQueryOptions` or `zamaQueryKeys`. Instead, inline the query logic directly using `useQuery` from `@tanstack/react-query` and `hashFn` from `@zama-fhe/sdk/query`:

```typescript
"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { hashFn } from "@zama-fhe/sdk/query";
import type { Address, RawLog, Handle } from "@zama-fhe/react-sdk";
import { useReadonlyToken } from "@zama-fhe/react-sdk";
import type { Hex } from "viem";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
  type ActivityItem,
  type ActivityLogMetadata,
} from "./activity";

/** Configuration for {@link useActivityFeed}. */
export interface UseActivityFeedConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Connected wallet address. Pass `undefined` to disable the query. */
  userAddress: Address | undefined;
  /** Raw event logs from the provider (viem, ethers, etc.). Pass `undefined` to disable. */
  logs: readonly (RawLog & Partial<ActivityLogMetadata>)[] | undefined;
  /** Whether to batch-decrypt encrypted transfer amounts. Default: `true`. */
  decrypt?: boolean;
}

/**
 * Two-phase activity feed hook.
 * Phase 1: Instantly parses raw logs into classified {@link ActivityItem}s (sync, cheap).
 * Phase 2: Batch-decrypts encrypted transfer amounts via the relayer (async).
 */
export function useActivityFeed(
  config: UseActivityFeedConfig,
): UseQueryResult<ActivityItem[]> {
  const { tokenAddress, userAddress, logs, decrypt: decryptOpt } = config;
  const token = useReadonlyToken(tokenAddress);
  const decrypt = decryptOpt ?? true;
  const logsKey =
    logs?.map((log) => `${log.transactionHash ?? ""}:${log.logIndex ?? ""}`).join(",") ?? "";

  return useQuery<ActivityItem[]>({
    queryKey: [
      "activityFeed",
      { tokenAddress, userAddress, logsKey, decrypt },
    ],
    queryKeyHashFn: hashFn,
    queryFn: async () => {
      if (!logs || !userAddress) return [];

      const parsed = parseActivityFeed(logs, userAddress);
      if (!decrypt) return sortByBlockNumber(parsed);

      const handles = extractEncryptedHandles(parsed) as Hex[];
      if (handles.length === 0) return sortByBlockNumber(parsed);

      const decrypted = await token.decryptHandles(handles, userAddress);
      return sortByBlockNumber(applyDecryptedValues(parsed, decrypted));
    },
    staleTime: Infinity,
    enabled: Boolean(userAddress && logs),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/test-components/src/activity-feed/use-activity-feed.ts
git commit -m "refactor: create self-contained useActivityFeed hook in test-components"
```

---

### Task 3: Create barrel export and update dependencies

**Files:**
- Create: `packages/test-components/src/activity-feed/index.ts`
- Modify: `packages/test-components/package.json`

- [ ] **Step 1: Create barrel export**

```typescript
export {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
  type ActivityDirection,
  type ActivityType,
  type ActivityAmount,
  type ActivityLogMetadata,
  type ActivityItem,
} from "./activity";

export { useActivityFeed, type UseActivityFeedConfig } from "./use-activity-feed";
```

- [ ] **Step 2: Add `@tanstack/react-query` peer dependency to test-components**

In `packages/test-components/package.json`, add to `peerDependencies`:

```json
"@tanstack/react-query": ">=5"
```

- [ ] **Step 3: Commit**

```bash
git add packages/test-components/src/activity-feed/index.ts packages/test-components/package.json
git commit -m "refactor: add activity-feed barrel export and tanstack peer dep"
```

---

### Task 4: Move activity.test.ts to test-components

**Files:**
- Create: `packages/test-components/src/activity-feed/__tests__/activity.test.ts`

- [ ] **Step 1: Copy activity.test.ts with adjusted imports**

Create `packages/test-components/src/activity-feed/__tests__/activity.test.ts` with the content of `packages/sdk/src/__tests__/activity.test.ts`, but replace the imports at lines 1-10:

```typescript
// OLD
import { describe, it, expect } from "../test-fixtures";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
  type ActivityItem,
} from "../activity";
import type { Handle } from "../relayer/relayer-sdk.types";
import { Topics, type RawLog } from "../events";
```

With:

```typescript
// NEW
import { describe, it, expect } from "vitest";
import {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
  type ActivityItem,
} from "../activity";
import { Topics, type RawLog, type Handle } from "@zama-fhe/react-sdk";
```

Keep the rest of the file (helpers, log builders, all test cases) identical.

Note: The original test uses `describe, it, expect` from a local `test-fixtures` module that wraps vitest. Since `test-components` doesn't have that fixture infrastructure, import directly from `vitest`.

- [ ] **Step 2: Commit**

```bash
git add packages/test-components/src/activity-feed/__tests__/activity.test.ts
git commit -m "refactor: copy activity feed tests to test-components"
```

---

### Task 5: Update ActivityFeedPanel to use local imports

**Files:**
- Modify: `packages/test-components/src/activity-feed-panel.tsx`

- [ ] **Step 1: Update imports in activity-feed-panel.tsx**

Replace the import block at lines 4-10:

```typescript
// OLD
import {
  useActivityFeed,
  useMetadata,
  TOKEN_TOPICS,
  type Address,
  type ActivityItem,
} from "@zama-fhe/react-sdk";
```

With:

```typescript
// NEW
import { useMetadata, TOKEN_TOPICS, type Address } from "@zama-fhe/react-sdk";
import { useActivityFeed, type ActivityItem } from "./activity-feed";
```

- [ ] **Step 2: Commit**

```bash
git add packages/test-components/src/activity-feed-panel.tsx
git commit -m "refactor: update ActivityFeedPanel to use local activity-feed imports"
```

---

## Chunk 2: Remove activity feed from SDK

### Task 6: Remove from core SDK exports

**Files:**
- Modify: `packages/sdk/src/index.ts:166-179`

- [ ] **Step 1: Remove activity feed exports from sdk/src/index.ts**

Delete lines 166-179 (the entire "Activity feed helpers and types" section):

```typescript
// Activity feed helpers and types
export type {
  ActivityDirection,
  ActivityType,
  ActivityAmount,
  ActivityLogMetadata,
  ActivityItem,
} from "./activity";
export {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "./activity";
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/index.ts
git commit -m "refactor: remove activity feed exports from @zama-fhe/sdk"
```

---

### Task 7: Remove from query subpath exports

**Files:**
- Modify: `packages/sdk/src/query/index.ts:72-76,101-102`

- [ ] **Step 1: Remove activity feed query exports from query/index.ts**

Delete lines 72-76:

```typescript
export {
  activityFeedQueryOptions,
  type ActivityFeedConfig,
  type ActivityFeedQueryConfig,
} from "./activity-feed";
```

Delete lines 101-102:

```typescript
export type { ActivityItem, ActivityLogMetadata } from "../activity";
export type { ActivityAmount, ActivityDirection, ActivityType } from "../activity";
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/query/index.ts
git commit -m "refactor: remove activity feed exports from @zama-fhe/sdk/query"
```

---

### Task 8: Remove activity feed query keys

**Files:**
- Modify: `packages/sdk/src/query/query-keys.ts:145-159`

- [ ] **Step 1: Remove activityFeed section from zamaQueryKeys**

Delete lines 145-159:

```typescript
  activityFeed: {
    all: ["zama.activityFeed"] as const,
    token: (tokenAddress: string) =>
      ["zama.activityFeed", { tokenAddress: getAddress(tokenAddress) }] as const,
    scope: (tokenAddress: string, userAddress: string, logsKey: string, decrypt: boolean) =>
      [
        "zama.activityFeed",
        {
          tokenAddress: getAddress(tokenAddress),
          userAddress: normalizeAddressIfPresent(userAddress),
          logsKey,
          decrypt,
        },
      ] as const,
  },
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/query/query-keys.ts
git commit -m "refactor: remove activityFeed query keys from zamaQueryKeys"
```

---

### Task 9: Remove activity feed invalidation calls

**Files:**
- Modify: `packages/sdk/src/query/invalidation.ts:30,46,53,58,72`

- [ ] **Step 1: Remove activityFeed invalidation from each function**

Remove these 5 lines (one per function):

In `invalidateAfterUnwrap` (line 30):
```typescript
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
```

In `invalidateAfterShield` (line 46):
```typescript
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
```

In `invalidateAfterUnshield` (line 53):
```typescript
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
```

In `invalidateAfterTransfer` (line 58):
```typescript
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
```

In `invalidateAfterApprove` (line 72):
```typescript
  queryClient.invalidateQueries({ queryKey: zamaQueryKeys.activityFeed.token(tokenAddress) });
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/query/invalidation.ts
git commit -m "refactor: remove activityFeed invalidation from mutation helpers"
```

---

### Task 10: Remove from react-sdk exports

**Files:**
- Modify: `packages/react-sdk/src/index.ts:230,271,331-344`

- [ ] **Step 1: Remove activity feed hook export (line 230)**

Delete:
```typescript
export { useActivityFeed, type UseActivityFeedConfig } from "./token/use-activity-feed";
```

- [ ] **Step 2: Remove activityFeedQueryOptions re-export (line 271)**

In the large re-export block from `@zama-fhe/sdk/query`, remove:
```typescript
  activityFeedQueryOptions,
```

- [ ] **Step 3: Remove activity feed type/function re-exports (lines 331-344)**

Delete the entire "Re-export activity feed types and helpers" section:
```typescript
// Re-export activity feed types and helpers from core SDK
export type {
  ActivityDirection,
  ActivityType,
  ActivityAmount,
  ActivityLogMetadata,
  ActivityItem,
} from "@zama-fhe/sdk";
export {
  parseActivityFeed,
  extractEncryptedHandles,
  applyDecryptedValues,
  sortByBlockNumber,
} from "@zama-fhe/sdk";
```

- [ ] **Step 4: Commit**

```bash
git add packages/react-sdk/src/index.ts
git commit -m "refactor: remove activity feed exports from @zama-fhe/react-sdk"
```

---

## Chunk 3: Delete source files and update tests

### Task 11: Delete activity feed source files

**Files:**
- Delete: `packages/sdk/src/activity.ts`
- Delete: `packages/sdk/src/query/activity-feed.ts`
- Delete: `packages/react-sdk/src/token/use-activity-feed.ts`

- [ ] **Step 1: Delete the source files**

```bash
rm packages/sdk/src/activity.ts
rm packages/sdk/src/query/activity-feed.ts
rm packages/react-sdk/src/token/use-activity-feed.ts
```

- [ ] **Step 2: Commit**

```bash
git add -u packages/sdk/src/activity.ts packages/sdk/src/query/activity-feed.ts packages/react-sdk/src/token/use-activity-feed.ts
git commit -m "refactor: delete activity feed source files from SDK"
```

---

### Task 12: Delete activity feed test files

**Files:**
- Delete: `packages/sdk/src/__tests__/activity.test.ts`
- Delete: `packages/sdk/src/query/__tests__/activity-feed.test.ts`
- Delete: `packages/react-sdk/src/token/__tests__/use-activity-feed.test.tsx`

- [ ] **Step 1: Delete the test files**

```bash
rm packages/sdk/src/__tests__/activity.test.ts
rm packages/sdk/src/query/__tests__/activity-feed.test.ts
rm packages/react-sdk/src/token/__tests__/use-activity-feed.test.tsx
```

- [ ] **Step 2: Commit**

```bash
git add -u packages/sdk/src/__tests__/activity.test.ts packages/sdk/src/query/__tests__/activity-feed.test.ts packages/react-sdk/src/token/__tests__/use-activity-feed.test.tsx
git commit -m "refactor: delete activity feed test files from SDK"
```

---

### Task 13: Update remaining test files

**Files:**
- Modify: `packages/sdk/src/query/__tests__/query-keys.test.ts`
- Modify: `packages/sdk/src/query/__tests__/invalidation.test.ts`
- Modify: `packages/react-sdk/src/token/__tests__/use-confidential-transfer.test.tsx`
- Modify: `packages/react-sdk/src/token/__tests__/use-confidential-transfer-from.test.tsx`

- [ ] **Step 1: Remove activityFeed test cases from query-keys.test.ts**

Remove all test cases that reference `zamaQueryKeys.activityFeed` (the `activityFeed.scope` tests around lines 118-196 that test key shape, address normalization, and logsKey/decrypt params).

- [ ] **Step 2: Remove activityFeed assertions from invalidation.test.ts**

In each invalidation test (`invalidateAfterShield`, `invalidateAfterTransfer`, `invalidateAfterUnshield`, `invalidateAfterUnwrap`, `invalidateAfterApprove`), remove the assertion lines that check `activityFeed.token` was invalidated. These are lines like:

```typescript
expect(mockInvalidateQueries).toHaveBeenCalledWith({
  queryKey: zamaQueryKeys.activityFeed.token(TOKEN),
});
```

Also update any count assertions (e.g., `toHaveBeenCalledTimes(N)` should be decremented by 1 for each removed assertion).

- [ ] **Step 3: Remove activityFeed assertions from use-confidential-transfer.test.tsx**

Remove assertions that check `activityFeed.token(TOKEN)` was invalidated after transfer. Also remove any `zamaQueryKeys` import if it was only used for activity feed assertions (unlikely — it's probably also used for balance key assertions, so just remove the activity feed references).

- [ ] **Step 4: Remove activityFeed assertions from use-confidential-transfer-from.test.tsx**

Same as step 3 — remove `activityFeed.token(TOKEN)` invalidation assertions.

- [ ] **Step 5: Run tests to verify everything passes**

```bash
pnpm test
```

Expected: All tests pass. No references to `activityFeed` remain in SDK or react-sdk test files.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/query/__tests__/query-keys.test.ts packages/sdk/src/query/__tests__/invalidation.test.ts packages/react-sdk/src/token/__tests__/use-confidential-transfer.test.tsx packages/react-sdk/src/token/__tests__/use-confidential-transfer-from.test.tsx
git commit -m "refactor: remove activityFeed references from remaining tests"
```

---

## Chunk 4: Build verification, API reports, and documentation

### Task 14: Build and verify

- [ ] **Step 1: Build both packages**

```bash
pnpm build
```

Expected: Clean build with no errors.

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: All tests pass.

- [ ] **Step 3: Verify no remaining activity feed references in SDK**

```bash
grep -r "activityFeed\|activity-feed\|ActivityFeed\|parseActivityFeed\|extractEncryptedHandles\|applyDecryptedValues\|sortByBlockNumber\|ActivityItem\|ActivityDirection\|ActivityType\|ActivityAmount\|ActivityLogMetadata" packages/sdk/src/ packages/react-sdk/src/ --include="*.ts" --include="*.tsx" -l
```

Expected: No files found. All activity feed references have been removed from SDK and react-sdk.

- [ ] **Step 4: Commit (if any build fixes were needed)**

---

### Task 15: Regenerate API reports

- [ ] **Step 1: Regenerate API reports**

```bash
pnpm api-report
```

This should update:
- `packages/sdk/etc/sdk.api.md`
- `packages/sdk/etc/sdk-query.api.md`
- `packages/react-sdk/etc/react-sdk.api.md`

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/etc/ packages/react-sdk/etc/
git commit -m "docs: regenerate API reports after activity feed removal"
```

---

### Task 16: Update README files

**Files:**
- Modify: `packages/sdk/README.md`
- Modify: `packages/react-sdk/README.md`

- [ ] **Step 1: Remove activity feed section from sdk/README.md**

Remove the "Activity Feed Helpers" section (around lines 622-685) that documents `parseActivityFeed`, `extractEncryptedHandles`, `applyDecryptedValues`, `sortByBlockNumber`, and the activity types.

- [ ] **Step 2: Remove activity feed section from react-sdk/README.md**

Remove the `useActivityFeed` documentation section (around lines 655-685). Also remove `activityFeed` from any query keys tables, and remove activity feed types from re-exported types lists.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/README.md packages/react-sdk/README.md
git commit -m "docs: remove activity feed documentation from READMEs"
```

---

### Task 17: Add changelog entry

- [ ] **Step 1: Add migration note to CHANGELOG**

Add to the changelog (or create if not present) a breaking change entry:

```markdown
### Breaking Changes

- **Removed `useActivityFeed` and activity feed helpers from SDK.** The following exports have been removed from `@zama-fhe/sdk` and `@zama-fhe/react-sdk`:
  - `useActivityFeed`, `UseActivityFeedConfig`
  - `parseActivityFeed`, `extractEncryptedHandles`, `applyDecryptedValues`, `sortByBlockNumber`
  - `ActivityItem`, `ActivityDirection`, `ActivityType`, `ActivityAmount`, `ActivityLogMetadata`
  - `activityFeedQueryOptions`, `ActivityFeedConfig`, `ActivityFeedQueryConfig`
  - `zamaQueryKeys.activityFeed`

  Activity feed logic is app-specific. See `packages/test-components/src/activity-feed/` for a reference implementation.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs: add breaking change note for activity feed removal"
```
