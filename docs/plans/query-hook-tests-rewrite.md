# Plan: Query Hook Tests Rewrite

**Unit**: `query-hook-tests-rewrite`
**Date**: 2026-03-04

## Work Type Assessment

**TDD does not apply.** This unit is a test-only rewrite — we are rewriting tests themselves, not production code. There is no observable behavior change to drive with TDD. The verification is: all tests pass with `bun run test` and meet the acceptance criteria.

## Overview

Rewrite `query-hooks.test.tsx` and the query-hook sections of `token-hooks-extended.test.tsx` to reach wagmi-level quality:

1. Rename all tests to follow the `default` / `behavior: ...` / `parameters: ...` / `error: ...` / `cache: ...` convention
2. Replace `it(...)` with `test(...)`
3. Add `toMatchInlineSnapshot` on TanStack state for every `default` test
4. Add `behavior: undefined → defined` transition tests for 5 hooks
5. Add `behavior: full lifecycle` test for `useConfidentialBalance`
6. Add `behavior: re-render preserves cached data` tests for `useConfidentialBalance` and `useUserDecryptedValue`

## Key Technical Decisions

### Inline Snapshot Strategy
- `dataUpdatedAt` varies per run → use `expect.any(Number)` asymmetric matcher NOT inside inline snapshot (inline snapshots don't support asymmetric matchers)
- Instead: extract `dataUpdatedAt` before snapshotting: `const { data, dataUpdatedAt, ...rest } = result.current;` then snapshot `rest`
- `queryKey` contains BigInt values → may need to extract or use custom serialization

### useConfidentialBalance Lifecycle API
- Research noted `refetchHandle()` doesn't exist — the actual API is `result.current.handleQuery.refetch()`
- The lifecycle test will use `handleQuery.refetch()` to trigger Phase 1 re-execution

### useUserDecryptedValue Stability Test
- Hook has `enabled: false` (cache-only) → must pre-seed QueryClient cache via `queryClient.setQueryData(decryptionKeys.value(handle), value)`
- Then render, capture `data`, rerender, assert same reference

### useWrapperDiscovery Transition
- Uses `skipToken` when `coordinatorAddress` is undefined — not signer-based
- Transition test: render with `coordinatorAddress: undefined`, then rerender with a valid address
- Requires re-rendering with different props (not just mock change + rerender)

### useActivityFeed Transition
- Requires both `userAddress` and `logs` to be defined
- Transition: render with both undefined → rerender with both defined

## Step-by-Step Changes

### Step 1: Rewrite `query-hooks.test.tsx`

**File**: `packages/react-sdk/src/__tests__/query-hooks.test.tsx`

Changes:
1. Replace `import { describe, expect, it, vi }` with `import { describe, expect, test, vi }`
2. Replace all `it(` with `test(`
3. Rename tests per convention table below
4. For every `default` test, add TanStack state inline snapshot pattern:
   ```tsx
   const { data, dataUpdatedAt, ...rest } = result.current;
   expect(data).toMatchObject({ /* existing assertion */ });
   expect(rest).toMatchInlineSnapshot(`...`);
   ```
5. Add `useWrapperDiscovery` transition test: `test('behavior: coordinatorAddress: undefined → defined')`
6. Add `useUnderlyingAllowance` describe block with `default` and `behavior: signer undefined → defined` tests (new — currently not in this file but belongs here per scope)

**Test rename mapping for query-hooks.test.tsx**:

| Describe | Old test name | New test name |
|----------|--------------|---------------|
| useTokenMetadata | `returns name, symbol, decimals` | `default` |
| useIsConfidential | `returns boolean result` | `default` |
| useIsWrapper | `returns boolean result` | `default` |
| useTotalSupply | `returns bigint result` | `default` |
| useConfidentialIsApproved | `stays idle when spender is undefined` | `behavior: disabled when spender is undefined` |
| useConfidentialIsApproved | `executes when spender is provided` | `default` |
| useWrapperDiscovery | `stays idle when coordinatorAddress is undefined` | `behavior: disabled when coordinatorAddress is undefined` |
| useWrapperDiscovery | `executes when coordinator is provided` | `default` |
| fee hooks | `useShieldFee calls signer.readContract` | `default` (nested under useShieldFee describe) |
| fee hooks | `useUnshieldFee calls signer.readContract` | `default` (nested under useUnshieldFee describe) |
| fee hooks | `useBatchTransferFee calls signer.readContract` | `default` (nested under useBatchTransferFee describe) |
| fee hooks | `useFeeRecipient calls signer.readContract` | `default` (nested under useFeeRecipient describe) |
| usePublicKey | `returns public key data from relayer` | `default` |
| usePublicParams | `returns public params data from relayer` | `default` |

**New tests to add**:

1. `useWrapperDiscovery` → `test('behavior: coordinatorAddress: undefined → defined')`:
   - Render with `coordinatorAddress: undefined` → assert `isPending: true`, `fetchStatus: 'idle'`
   - Rerender the hook with `coordinatorAddress: "0x5555..."` → wait for `isSuccess`
   - Uses `renderHook` with `initialProps` to enable prop-driven rerender

2. `useUnderlyingAllowance` describe block:
   - `test('default')`: signer resolves, `readContract` returns `1000n`, wait for success + inline snapshot
   - `test('behavior: signer undefined → defined')`: reject `getAddress` → assert idle → resolve → rerender → success

### Step 2: Rewrite query sections of `token-hooks-extended.test.tsx`

**File**: `packages/react-sdk/src/__tests__/token-hooks-extended.test.tsx`

Changes to query hooks section (lines 418–638). **Mutation hooks (lines 1–416) are NOT in scope — leave untouched.**

1. Replace `it(` with `test(` in query sections only
2. Rename tests per convention
3. Add TanStack state inline snapshots to default tests
4. Add new transition + lifecycle + stability tests

**Test rename mapping for token-hooks-extended.test.tsx (query section)**:

| Describe | Old test name | New test name |
|----------|--------------|---------------|
| useConfidentialBalance | `resolves the handle via phase 1 polling` | `default` |
| useConfidentialBalance | `disables downstream queries when getAddress fails` | `error: disabled when getAddress fails` |
| useConfidentialBalance | `does not fetch when signer address is unavailable` | `behavior: disabled when signer address unavailable` |
| useConfidentialBalance | `balance query stays disabled when handle is not yet resolved` | `behavior: disabled when handle is not yet resolved` |
| useConfidentialBalance | `does not run decrypt query when options.enabled=true but handle is undefined` | `behavior: disabled when handle undefined despite enabled=true` |
| useConfidentialBalances | `resolves handles for multiple tokens` | `default` |
| useConfidentialBalances | `stays idle when tokenAddresses is empty` | `behavior: disabled when tokenAddresses is empty` |
| useConfidentialBalances | `disables downstream queries when getAddress fails` | `error: disabled when getAddress fails` |
| useConfidentialBalances | `does not fetch when signer address is unavailable` | `behavior: disabled when signer address unavailable` |
| useConfidentialBalances | `keeps decrypt query disabled when options.enabled=true but owner is unavailable` | `behavior: disabled when owner unavailable despite enabled=true` |
| useConfidentialBalances | `does not run decrypt query when options.enabled=true but handles are undefined` | `behavior: disabled when handles undefined despite enabled=true` |
| useActivityFeed | `stays idle when logs is undefined` | `behavior: disabled when logs is undefined` |
| useActivityFeed | `stays idle when userAddress is undefined` | `behavior: disabled when userAddress is undefined` |
| useActivityFeed | `returns empty array when logs is empty` | `default` |
| useActivityFeed | `is enabled when both userAddress and logs are provided` | _(remove — covered by default test)_ |

**New tests to add**:

3. `useConfidentialBalance` → `test('behavior: signer undefined → defined')`:
   - `signer.getAddress` rejects → `isPending: true`, `fetchStatus: 'idle'`
   - Fix mock to resolve → rerender → wait for `handleQuery.isSuccess`

4. `useConfidentialBalance` → `describe('behavior: full lifecycle')` with test `handle poll → decrypt → balance value`:
   - Mock `signer.readContract` to return handle `"0x" + "aa".repeat(32)`
   - Wait for `handleQuery.isSuccess`
   - Assert `handleQuery.data` is the handle
   - Mock relayer/decrypt to return balance value
   - Use `handleQuery.refetch()` to simulate handle change → new decrypt fires
   - **Note**: The full decrypt flow requires `confidentialBalanceQueryOptions` which calls `token.decryptBalance` internally. This may not trigger with just mock `readContract`. If too complex, test the phase boundary: assert handle resolves, then assert balance query `enabled` state transitions correctly.

5. `useConfidentialBalance` → `test('behavior: re-render preserves cached data')`:
   - Render, wait for `handleQuery.isSuccess`, capture `handleQuery.data`
   - Rerender → assert `result.current.handleQuery.data` is same reference (`toBe`)

6. `useConfidentialBalances` → `test('behavior: signer undefined → defined')`:
   - Same pattern as #3 but using `handlesQuery`

7. `useActivityFeed` → `test('behavior: params undefined → defined')`:
   - Render with `userAddress: undefined, logs: undefined` → idle
   - Rerender with both defined → wait for success
   - Uses `renderHook` with `initialProps` pattern

8. `useUserDecryptedValue` → `test('behavior: re-render preserves cached data')`:
   - Pre-seed `queryClient.setQueryData(decryptionKeys.value("0xhandle"), 1000n)`
   - Render `useUserDecryptedValue("0xhandle")` → data should be `1000n`
   - Rerender → assert same `data` reference via `toBe`
   - **Import needed**: `decryptionKeys` from `../relayer/decryption-cache`

### Step 3: Handle `initialProps` pattern for prop-change tests

Several transition tests require changing hook props between renders. The pattern:

```tsx
const { result, rerender } = renderHook(
  ({ coordinatorAddress }) => useWrapperDiscovery({ tokenAddress: TOKEN, coordinatorAddress }),
  {
    wrapper: ctx.Wrapper,
    initialProps: { coordinatorAddress: undefined as Address | undefined },
  },
);
// Phase 1: idle
rerender({ coordinatorAddress: "0x5555..." as Address });
// Phase 2: fetching → success
```

This means for prop-change-based transitions (useWrapperDiscovery, useActivityFeed), we need to use `renderHook` directly with `initialProps` instead of `renderWithProviders`. We'll create a `createWrapper` + `renderHook` combo for these tests.

### Step 4: Run inline snapshot generation

After writing all tests with empty `toMatchInlineSnapshot(\`\`)` calls:
1. Run `bun run test -- --update` to populate inline snapshots
2. Review generated snapshots for correctness
3. Extract any non-deterministic fields (`dataUpdatedAt`) if they cause flaky snapshots

### Step 5: Verify acceptance criteria

1. `bun run test` passes for both files
2. Verify each of the 5 transition tests exists and follows three-phase pattern
3. Verify lifecycle test block exists for `useConfidentialBalance`
4. Verify stability tests exist for `useConfidentialBalance` and `useUserDecryptedValue`
5. Verify all `default` tests have `toMatchInlineSnapshot`
6. Grep for `should`, `returns`, `calls` in test names — should find none in query test sections
7. Grep for `vi.mock(` at module level — should find none

## Files to Modify

| File | Changes |
|------|---------|
| `packages/react-sdk/src/__tests__/query-hooks.test.tsx` | Full rewrite: renames, inline snapshots, new transition tests for useWrapperDiscovery and useUnderlyingAllowance |
| `packages/react-sdk/src/__tests__/token-hooks-extended.test.tsx` | Rewrite query section: renames, inline snapshots, new transition/lifecycle/stability tests |

## Files NOT Modified

- `packages/react-sdk/src/__tests__/test-utils.tsx` — no changes needed (createWrapper already provides everything)
- Hook implementation files — this is test-only work
- Mutation hook tests in token-hooks-extended.test.tsx — out of scope

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Inline snapshots with BigInt `queryKey` values may not serialize correctly in vitest | Snapshot tests fail | Extract `queryKey` alongside `data` and `dataUpdatedAt` before snapshotting; or test queryKey separately with `toEqual` |
| `useConfidentialBalance` lifecycle test is complex (3-phase cascade with relayer) | Test may be flaky or hard to mock | Start with testing the phase boundary (handle resolves → balance enabled transitions), escalate to full decrypt only if mocking is tractable |
| `useUserDecryptedValue` stability test: `setQueryData` may clone the value | Reference equality assertion fails (`toBe`) | BigInt primitives are immutable — `1000n === 1000n` is `true`. For object data, would need structural sharing, but bigint is safe |
| Prop-change transition tests need `initialProps` from `renderHook` | Can't use `renderWithProviders` helper directly | Use `createWrapper()` + `renderHook` with `initialProps` for these specific tests |
| `dataUpdatedAt` non-determinism | Inline snapshots differ across runs | Extract `dataUpdatedAt` from `rest` before snapshotting: `const { data, dataUpdatedAt, ...meta } = result.current;` |

## Verification Against Acceptance Criteria

| # | Criterion | How to verify |
|---|-----------|---------------|
| 1 | Both files pass with `bun run test` | Run `bun run test packages/react-sdk/src/__tests__/query-hooks.test.tsx packages/react-sdk/src/__tests__/token-hooks-extended.test.tsx` |
| 2 | 5 hooks have `behavior: undefined → defined` tests | Grep for `undefined → defined` or `undefined -> defined` in both test files |
| 3 | useConfidentialBalance has `behavior: full lifecycle` | Grep for `full lifecycle` in token-hooks-extended.test.tsx |
| 4 | Stability tests exist | Grep for `re-render preserves cached data` in test files |
| 5 | Every `default` test uses `toMatchInlineSnapshot` | Grep for `toMatchInlineSnapshot` count matches `default` test count |
| 6 | No `should`/`returns`/`calls` in test names | `grep -E "test\('" \| grep -iE "'(should|returns|calls)"` returns 0 matches |
| 7 | No `vi.mock()` at module level | `grep "vi.mock(" *.test.tsx` returns 0 matches at top level |
