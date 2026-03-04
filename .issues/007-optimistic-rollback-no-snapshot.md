# ISSUE-007: Optimistic update rollback triggers expensive refetch instead of snapshot restore

**Severity**: low
**Confidence**: 80/100
**Type**: design

## Description

`applyOptimisticBalanceDelta` reads previous cache values but doesn't return them. `rollbackOptimisticBalanceDelta` uses `invalidateQueries` (full network refetch + expensive decrypt) instead of restoring the snapshot.

## Evidence

```ts
// optimistic-balance-update.ts:7-20
export async function applyOptimisticBalanceDelta(...) {
  const previous = queryClient.getQueriesData<bigint>({ queryKey: balanceKey });
  for (const [key, value] of previous) {
    if (value === undefined) continue;
    queryClient.setQueryData(key, mode === "add" ? value + amount : value - amount);
  }
  // `previous` is read but never returned — snapshot is lost
}

// use-shield.ts:67-71
onError: (error, variables, onMutateResult, context) => {
  if (config.optimistic) {
    rollbackOptimisticBalanceDelta(queryClient, config.tokenAddress);
    // invalidateQueries → full decrypt roundtrip (2-5s)
  }
},
```

## Impact

On mutation failure (e.g., user rejects wallet prompt), balance disappears briefly while a full decrypt cycle runs. With snapshot restore, the original balance would appear instantly. Not a correctness bug — just degraded UX on the error path.

## Fix

Return `previous` from `applyOptimisticBalanceDelta`, store it in `onMutate` context, and use `setQueryData` in `onError` to restore instantly.
