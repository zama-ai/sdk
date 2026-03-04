# ISSUE-002: Missing normalizeHandle in confidentialHandleQueryOptions

**Severity**: medium
**Confidence**: 85/100
**Type**: regression

## Description

The new `confidentialHandleQueryOptions` factory calls `signer.readContract<Address>(confidentialBalanceOfContract(...))` directly, bypassing `ReadonlyToken.normalizeHandle()` that the old code path went through via `token.confidentialBalanceOf()`.

## Before (main)

The old hook called `token.confidentialBalanceOf()` → `readConfidentialBalanceOf()` → `normalizeHandle(result)`:

```ts
// readonly-token.ts:501-508
protected normalizeHandle(value: unknown): Address {
  if (typeof value === "string" && value.startsWith("0x")) return value as Address;
  if (typeof value === "bigint") return `0x${value.toString(16).padStart(64, "0")}`;
  return ZERO_HANDLE;
}
```

## After (refactored)

```ts
// packages/sdk/src/query/confidential-handle.ts:25-29
queryFn: async (context) => {
  const [, { tokenAddress: keyTokenAddress, owner: keyOwner }] = context.queryKey;
  return signer.readContract<Address>(
    confidentialBalanceOfContract(keyTokenAddress as Address, keyOwner as Address),
  );
  // raw result — no normalizeHandle
},
```

## Impact

If any signer adapter returns a `bigint` for `uint256` reads (ethers.js does this for some ABIs), the handle will be a raw bigint instead of a hex string. Downstream `isZeroHandle(handle)` — which does string comparison — would fail, causing unnecessary/failing decrypt attempts for zero-balance accounts.

Same issue exists in `confidential-handles.ts` (batch variant).

## Fix

Either:

1. Add `normalizeHandle` as a standalone exported utility in `@zama-fhe/sdk` and call it in the factory
2. Or type the `readContract` call as `readContract<bigint>` and convert explicitly
