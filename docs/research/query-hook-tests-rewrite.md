# Research: Query Hook Tests Rewrite

**Unit**: `query-hook-tests-rewrite`
**Date**: 2026-03-04

## Objective

Complete rewrite of `query-hooks.test.tsx` and `token-hooks-extended.test.tsx` to reach wagmi-level quality following the rules in `TEST_UPDATE_PLAN.md`.

## Relevant Files

### Files to Rewrite

| File | Path |
|------|------|
| query-hooks.test.tsx | `packages/react-sdk/src/__tests__/query-hooks.test.tsx` |
| token-hooks-extended.test.tsx | `packages/react-sdk/src/__tests__/token-hooks-extended.test.tsx` |

### Hook Implementations

| Hook | Path |
|------|------|
| `useConfidentialBalance` | `packages/react-sdk/src/token/use-confidential-balance.ts` |
| `useConfidentialBalances` | `packages/react-sdk/src/token/use-confidential-balances.ts` |
| `useUnderlyingAllowance` | `packages/react-sdk/src/token/use-underlying-allowance.ts` |
| `useWrapperDiscovery` | `packages/react-sdk/src/token/use-wrapper-discovery.ts` |
| `useActivityFeed` | `packages/react-sdk/src/token/use-activity-feed.ts` |
| `useUserDecryptedValue` | `packages/react-sdk/src/relayer/use-user-decrypted-value.ts` |

### Test Infrastructure

| File | Path |
|------|------|
| Test utilities | `packages/react-sdk/src/__tests__/test-utils.tsx` |
| Query keys | `packages/sdk/src/query/query-keys.ts` |
| Query factories | `packages/sdk/src/query/confidential-balance.ts`, etc. |

### Reference Files

| File | Path |
|------|------|
| wagmi useBalance test | `/Users/msaug/zama/wagmi/packages/react/src/hooks/useBalance.test.ts` |
| RFC spec | `/Users/msaug/zama/token-sdk/TEST_UPDATE_PLAN.md` |

## RFC Sections in Scope

- **§PR Scope 1**: Add `'behavior: undefined → defined'` transition tests for 5 hooks
- **§PR Scope 3**: Add full lifecycle test for `useConfidentialBalance`
- **§PR Scope 4**: Add re-render stability tests for `useConfidentialBalance` and `useUserDecryptedValue`
- **§PR Scope 5**: Update every `'default'` test to use `toMatchInlineSnapshot` on TanStack state
- **§PR Scope 7**: Rename all tests to follow convention
- **§Rule 2**: Three canonical tests per query hook
- **§Rule 3**: Snapshot full TanStack state
- **§Rule 7**: Test naming convention

## Current State Analysis

### query-hooks.test.tsx (currently)

The file tests: `useTokenMetadata`, `useIsConfidential`, `useIsWrapper`, `useTotalSupply`, `useConfidentialIsApproved`, `useWrapperDiscovery`, fee hooks (`useShieldFee`, `useUnshieldFee`, `useBatchTransferFee`, `useFeeRecipient`), `usePublicKey`, `usePublicParams`.

**Issues**:
- Uses `it(...)` not `test(...)` (wagmi uses `test(...)`)
- Existing tests named as `"returns name, symbol, decimals"`, `"returns boolean result"`, etc. — must be renamed to `'default'`
- No TanStack inline snapshots — all tests just do `expect(result.current.data).toEqual(...)`
- Missing `'behavior: undefined → defined'` transitions for `useWrapperDiscovery`
- `useWrapperDiscovery` tests don't follow the three-phase pattern

### token-hooks-extended.test.tsx (currently)

Mixed file testing both mutation hooks (7 hooks) and query hooks (`useConfidentialBalance`, `useConfidentialBalances`, `useActivityFeed`).

**Issues**:
- Uses `it(...)` not `test(...)`
- Test names don't follow convention (e.g., `"resolves the handle via phase 1 polling"`, `"disables downstream queries when getAddress fails"`)
- No inline snapshots on default tests
- Missing `'behavior: undefined → defined'` transition tests for `useConfidentialBalance`, `useConfidentialBalances`, `useActivityFeed`
- Missing re-render stability tests

## Hook Architecture Summary

### `useConfidentialBalance` (two-phase)

```
Phase 1: signerAddressQuery → owner
Phase 2: confidentialHandleQuery (enabled when owner) → handle
Phase 3: confidentialBalanceQuery (enabled when owner && handle) → bigint
```

**`enabled` guard**: `factoryEnabled && (userEnabled ?? true)` where `factoryEnabled = Boolean(ownerKey && handleKey)`.

**Key**: `zamaQueryKeys.confidentialBalance.owner(tokenAddress, owner, handle)`

### `useConfidentialBalances` (two-phase batch)

```
Phase 1: signerAddressQuery → owner
Phase 2: confidentialHandlesQuery (enabled when owner && tokenAddresses.length > 0) → handles[]
Phase 3: confidentialBalancesQuery (enabled when owner && handlesReady) → Map<Address, bigint>
```

**`handlesReady`**: `Array.isArray(handles) && handles.length === tokenAddresses.length`

### `useUnderlyingAllowance`

```
Phase 1: signerAddressQuery → owner
Phase 2: underlyingAllowanceQuery (enabled when owner) → bigint
```

**`enabled` guard**: `Boolean(ownerKey) && config.query?.enabled !== false`

### `useWrapperDiscovery`

```
Single query: enabled when coordinatorAddress is defined
Uses skipToken when coordinatorAddress is undefined
```

### `useActivityFeed`

```
Single query: activityFeedQueryOptions
enabled when userAddress && logs are defined
```

### `useUserDecryptedValue`

```
Cache-only query: enabled: false, populated externally
No network calls, reads from TanStack cache
```

## Test Patterns to Apply

### Pattern 1: Three Canonical Tests Per Hook (Rule 2)

```tsx
test('default', async () => {
  const signer = createMockSigner();
  vi.mocked(signer.readContract).mockResolvedValue(/* valid value */);
  const { result } = renderWithProviders(() => useHook(params), { signer });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const { data, ...rest } = result.current;
  expect(data).toMatchObject({ /* domain assertions */ });
  expect(rest).toMatchInlineSnapshot(`{ /* full TanStack state */ }`);
});

test('behavior: disabled when ...', () => {
  // missing params → isPending: true, fetchStatus: 'idle'
});

test('behavior: signer undefined → defined', async () => {
  const signer = createMockSigner();
  vi.mocked(signer.getAddress).mockRejectedValue(new Error("no signer"));
  const { result, rerender } = renderWithProviders(() => useHook(params), { signer });

  // Phase 1: disabled
  expect(result.current.isPending).toBe(true);
  expect(result.current.fetchStatus).toBe('idle');

  // Signer becomes available
  vi.mocked(signer.getAddress).mockResolvedValue(USER);
  rerender();

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
```

### Pattern 2: Inline Snapshot on TanStack State (Rule 3)

```tsx
const { data, ...rest } = result.current;
expect(data).toMatchObject({ /* domain-specific */ });
expect(rest).toMatchInlineSnapshot(`
  {
    "dataUpdatedAt": 0,
    "error": null,
    "errorUpdateCount": 0,
    "errorUpdatedAt": 0,
    "failureCount": 0,
    "failureReason": null,
    "fetchStatus": "idle",
    "handleQuery": { ... },
    "isError": false,
    "isFetched": true,
    ...
  }
`);
```

Note: For `useConfidentialBalance`, `rest` will include `handleQuery`.

### Pattern 3: Re-render Stability (PR Scope 4)

```tsx
test('behavior: re-render preserves cached data', async () => {
  const { result, rerender } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), { signer });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const firstData = result.current.data;
  rerender();
  expect(result.current.data).toBe(firstData); // same reference
});
```

### Pattern 4: Full Lifecycle Test (PR Scope 3)

```tsx
describe('behavior: full lifecycle', () => {
  test('handle change triggers new decryption', async () => {
    const signer = createMockSigner();
    vi.mocked(signer.readContract).mockResolvedValueOnce("0x" + "aa".repeat(32));
    const { result } = renderWithProviders(() => useConfidentialBalance({ tokenAddress: TOKEN }), { signer });
    await waitFor(() => expect(result.current.handleQuery.isSuccess).toBe(true));
    // verify handle, then trigger refetch with new handle
  });
});
```

## Test Naming Convention (Rule 7)

| Old Name | New Name |
|----------|----------|
| `"returns name, symbol, decimals"` | `'default'` |
| `"returns boolean result"` | `'default'` |
| `"returns bigint result"` | `'default'` |
| `"stays idle when coordinatorAddress is undefined"` | `'behavior: disabled when coordinatorAddress is undefined'` |
| `"executes when coordinator is provided"` | `'default'` |
| `"resolves the handle via phase 1 polling"` | `'default'` |
| `"disables downstream queries when getAddress fails"` | `'error: disabled when getAddress fails'` |
| `"does not fetch when signer address is unavailable"` | `'behavior: disabled when signer address unavailable'` |
| `"stays idle when logs is undefined"` | `'behavior: disabled when logs is undefined'` |
| `"returns empty array when logs is empty"` | `'default'` |

## Mock Setup Notes

### `createMockSigner()` returns:
- `getAddress` → resolves to `"0x2222222222222222222222222222222222222222"` (USER)
- `readContract` → resolves to `"0x0"` by default
- `writeContract` → resolves to `"0xtxhash"`

### For `useConfidentialBalance` default test:
- Phase 1 (handle): mock `signer.readContract` to return a valid handle hex
- Phase 2 (balance): the `confidentialBalanceQueryOptions` calls `token.decryptBalance` which uses the relayer's `userDecrypt`

### For transition tests (`signer undefined → defined`):
```tsx
// Start: make getAddress reject
vi.mocked(signer.getAddress).mockRejectedValue(new Error("no signer"));
// Then: make it succeed
vi.mocked(signer.getAddress).mockResolvedValue(USER);
rerender();
```

### For `useWrapperDiscovery` transition (`coordinatorAddress undefined → defined`):
The hook uses `skipToken` when `coordinatorAddress` is undefined, so the pattern differs from signer-based transitions. Need to rerender with coordinator address provided.

### `useUserDecryptedValue` stability test:
Since `enabled: false` always (cache-only), pre-populate cache:
```tsx
queryClient.setQueryData(decryptionKeys.value("0xhandle"), 1000n);
// render with handle → get data → rerender → same reference
```

## `zamaQueryKeys` Reference

Key namespaces used in tests:
- `zamaQueryKeys.confidentialHandle.token(TOKEN)` — invalidation target
- `zamaQueryKeys.confidentialBalance.token(TOKEN)` — reset target
- `zamaQueryKeys.confidentialHandles.all` — invalidation target
- `zamaQueryKeys.confidentialBalances.all` — invalidation target
- `zamaQueryKeys.underlyingAllowance.scope(tokenAddress, owner, wrapperAddress)` — full key
- `zamaQueryKeys.activityFeed.scope(tokenAddress, userAddress, logsKey, decrypt)` — full key

## Files NOT in Scope for This Unit

- `mutation-hooks.test.tsx` — covered by §PR Scope 2 (separate unit)
- `query-options.test.ts` — covered by §PR Scope 6 (separate unit)
- `provider.test.tsx`, `provider-hooks-extended.test.tsx`, `relayer-hooks.test.tsx` — not in scope

## Wagmi Reference Patterns

From `useBalance.test.ts`:
1. `test('default')` at L17 — `data` split with `toMatchObject`, `rest` with `toMatchInlineSnapshot`
2. `test('parameters: chainId')` at L66 — full `result.current` inline snapshot when data is stable
3. `test('behavior: address: undefined -> defined')` at L114 — three-phase: snapshot disabled state → rerender → snapshot success state
4. `test('behavior: disabled when properties missing')` at L201 — `isPending: true` after brief wait

Key difference vs token-sdk: wagmi uses a real testnet client, so `dataUpdatedAt` is deterministic. In our tests, `dataUpdatedAt` will vary, so inline snapshots may need to use `expect.any(Number)` or exclude time fields.

## Implementation Checklist

### query-hooks.test.tsx rewrites

- [ ] `useTokenMetadata`: rename to `'default'`, add inline snapshot
- [ ] `useIsConfidential`: rename to `'default'`, add inline snapshot
- [ ] `useIsWrapper`: rename to `'default'`, add inline snapshot
- [ ] `useTotalSupply`: rename to `'default'`, add inline snapshot
- [ ] `useConfidentialIsApproved`: rename tests, add `'behavior: disabled when spender undefined'`
- [ ] `useWrapperDiscovery`: rename tests, add `'behavior: coordinatorAddress: undefined → defined'` transition
- [ ] Fee hooks: rename to `'default'`
- [ ] `usePublicKey`: rename to `'default'`, add inline snapshot
- [ ] `usePublicParams`: rename to `'default'`, add inline snapshot

### token-hooks-extended.test.tsx rewrites (query hooks section only)

- [ ] `useConfidentialBalance.default`: rename + inline snapshot
- [ ] `useConfidentialBalance`: add `'behavior: signer undefined → defined'`
- [ ] `useConfidentialBalance`: add `'behavior: re-render preserves cached data'`
- [ ] `useConfidentialBalance`: add `describe('behavior: full lifecycle')` block
- [ ] `useConfidentialBalances.default`: rename + inline snapshot
- [ ] `useConfidentialBalances`: add `'behavior: signer undefined → defined'`
- [ ] `useActivityFeed.default`: rename `"returns empty array when logs is empty"` + inline snapshot
- [ ] `useActivityFeed`: add `'behavior: tokenAddress undefined → defined'` or similar transition
- [ ] `useUnderlyingAllowance`: add `'default'` + `'behavior: signer undefined → defined'`
- [ ] `useUserDecryptedValue`: add `'behavior: re-render preserves cached data'`

### Rename existing tests

- [ ] All `it(...)` → `test(...)`
- [ ] All non-convention names → convention names per table above

## Open Questions

1. For inline snapshots on `useConfidentialBalance`, `rest` contains `handleQuery` which is itself a full TanStack query result object. Should `handleQuery` be fully snapshotted or extracted separately?
2. `dataUpdatedAt` in inline snapshots will vary at runtime — wagmi works around this with frozen fake timers. Does our test infrastructure support fake timers? Need to check if `vi.useFakeTimers()` is set up in vitest config.
3. The lifecycle test uses `result.current.refetchHandle()` — does `useConfidentialBalance` expose this method? Looking at the implementation, it returns `{ ...balanceQuery, handleQuery }` — `handleQuery.refetch` would be the refetch for the handle, not `refetchHandle`. Plan code uses `result.current.refetchHandle()` but the actual API is `result.current.handleQuery.refetch()`.
4. For `useWrapperDiscovery`, the transition is `coordinatorAddress: undefined → Address` (not signer-based), so the pattern differs from the signer transition tests for other hooks.
5. For `useActivityFeed`, the transition is `logs: undefined → []` and `userAddress: undefined → Address` — both need to be provided simultaneously to enable the query.
