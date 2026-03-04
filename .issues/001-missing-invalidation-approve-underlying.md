# ISSUE-001: Missing cache invalidation in useApproveUnderlying

**Severity**: critical
**Confidence**: 98/100
**Type**: regression

## Description

The refactored `useApproveUnderlying` hook lost its `onSuccess` callback that invalidated the underlying allowance cache. After a successful ERC-20 approval, `useUnderlyingAllowance` queries will show stale (pre-approval) data.

## Before (main)

```ts
// packages/react-sdk/src/token/use-approve-underlying.ts
return useMutation({
  mutationKey: ["approveUnderlying", config.tokenAddress],
  mutationFn: ({ amount }) => token.approveUnderlying(amount),
  ...options,
  onSuccess: (data, variables, onMutateResult, context) => {
    context.client.invalidateQueries({
      queryKey: underlyingAllowanceQueryKeys.all,
    });
    options?.onSuccess?.(data, variables, onMutateResult, context);
  },
});
```

## After (refactored)

```ts
// packages/react-sdk/src/token/use-approve-underlying.ts:32-35
return useMutation({
  ...approveUnderlyingMutationOptions(token),
  ...options,
  // NO onSuccess — invalidation dropped entirely
});
```

## Impact

After calling `useApproveUnderlying().mutate()`, any `useUnderlyingAllowance` queries show stale data. This breaks the shield flow: user approves → shield button stays disabled because it still sees zero allowance.

## Fix

Add `onSuccess` that calls `invalidateAfterApproveUnderlying` (or inline invalidation):

```ts
return useMutation({
  ...approveUnderlyingMutationOptions(token),
  ...options,
  onSuccess: (data, variables, onMutateResult, context) => {
    context.client.invalidateQueries({
      queryKey: zamaQueryKeys.underlyingAllowance.all,
    });
    options?.onSuccess?.(data, variables, onMutateResult, context);
  },
});
```
