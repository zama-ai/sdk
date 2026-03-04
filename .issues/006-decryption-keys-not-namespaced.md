# ISSUE-006: decryptionKeys not namespaced under zama. prefix

**Severity**: medium
**Confidence**: 85/100
**Type**: guideline-violation

## Description

`decryptionKeys` in `react-sdk/src/relayer/decryption-cache.ts` uses `["decryptedValue", handle]` — no `zama.` namespace, not part of `zamaQueryKeys`, and uses positional args instead of the `[label, { params }]` pattern.

## Rule violated

TASK_1.md line 481-490 (Step 3): "Namespace all query keys under `zama.`"
TASK_1.md line 186: "No `zama.` namespace — keys could collide in shared QueryClient"

## Evidence

```ts
// react-sdk/src/relayer/decryption-cache.ts:6-8
export const decryptionKeys = {
  value: (handle: string) => ["decryptedValue", handle] as const,
};
```

## Impact

Could collide with other libraries using `"decryptedValue"` as a query key prefix in a shared QueryClient. Also inconsistent with the rest of the codebase.

Additionally, `useUserDecryptedValue` and `useUserDecryptedValues` that consume these keys do not pass `queryKeyHashFn: hashFn`, violating the rule that every `useQuery` call must inject `hashFn`.

## Fix

Move to `zamaQueryKeys.decryption.handle(handle)` which already exists in `query-keys.ts`, and add `queryKeyHashFn: hashFn` to the hooks.
