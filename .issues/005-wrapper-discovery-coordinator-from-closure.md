# ISSUE-005: wrapperDiscoveryQueryOptions reads coordinatorAddress from closure, not key

**Severity**: medium
**Confidence**: 90/100
**Type**: guideline-violation

## Description

The `wrapperDiscoveryQueryOptions` factory is classified as "decoupled" (takes `signer + address`), but `coordinatorAddress` is read from the closure instead of `context.queryKey`. The query key only contains `tokenAddress`, not `coordinatorAddress`.

## Rule violated

TASK_1.md line 251-253:

> "Decoupled factories extract all data params from `context.queryKey`. Only `signer` (infrastructure) is closed over."

## Evidence

```ts
// wrapper-discovery.ts:20-29
queryFn: async (context) => {
  const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
  const exists = await signer.readContract<boolean>(
    wrapperExistsContract(config.coordinatorAddress, keyTokenAddress), // closure!
  );
  if (!exists) return null;
  return signer.readContract<Address>(
    getWrapperContract(config.coordinatorAddress, keyTokenAddress),    // closure!
  );
},
```

Query key: `["zama.wrapperDiscovery", { tokenAddress }]` — no `coordinatorAddress`.

## Impact

If `coordinatorAddress` ever changes (unlikely in practice since it's a protocol constant), the query would fetch from the new coordinator but cache under the old key. More practically, this means the factory can't be tested for key-param alignment.

## Fix

Add `coordinatorAddress` to the query key, or document this as an intentional exception.
