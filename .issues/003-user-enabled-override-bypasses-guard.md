# ISSUE-003: User options spread can override factory `enabled` guard

**Severity**: high
**Confidence**: 90/100
**Type**: bug

## Description

In `useConfidentialBalance`, user `options` are spread AFTER the factory options (line 72), allowing `{ enabled: true }` to override the factory's safety gate that prevents decrypt queries from firing before the handle is available.

## Evidence

```ts
// use-confidential-balance.ts:67-74
const balanceQuery = useQuery({
  ...confidentialBalanceQueryOptions(token, {
    handle: handleQuery.data as Address | undefined,
    owner,
  }),
  ...options, // <-- user { enabled: true } overrides factory enabled: false
  queryKeyHashFn: hashFn,
} as unknown as UseQueryOptions<bigint, Error>);
```

The factory sets `enabled: Boolean(ownerKey && handleKey)` — but `...options` spread comes after and can override it.

## Impact

If a consumer passes `{ enabled: true }` in options, the decrypt call fires with `handle: ""`, which passes `isZeroHandle` (only matches `0x000...` and `"0x"`, not `""`) and calls the relayer with an invalid handle — producing a cryptic error.

Same issue in `useConfidentialBalances` at line 84.

## Fix

Destructure `enabled` from options and compose it with the factory guard rather than blindly spreading:

```ts
const { enabled: userEnabled, ...restOptions } = options ?? {};
const balanceQuery = useQuery({
  ...confidentialBalanceQueryOptions(token, { handle, owner }),
  ...restOptions,
  // Factory enabled AND user enabled (if provided)
  enabled:
    confidentialBalanceQueryOptions(token, { handle, owner }).enabled && (userEnabled ?? true),
  queryKeyHashFn: hashFn,
});
```

Or move `options` spread before the factory options (wagmi pattern).
