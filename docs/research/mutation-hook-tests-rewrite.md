# Research: Mutation Hook Tests Rewrite

**Unit**: mutation-hook-tests-rewrite
**Date**: 2026-03-04

## Summary

Complete rewrite of `mutation-hooks.test.tsx` to reach wagmi-level quality. The primary work is adding `cache: invalidates X after Y` tests for all mutation hooks, updating `default` tests to use `toMatchInlineSnapshot`, and renaming tests to follow naming conventions.

---

## Key Files

### Test File to Rewrite
- `packages/react-sdk/src/__tests__/mutation-hooks.test.tsx` — Current test file (293 lines). Has optimistic update tests but is **missing** `cache:` invalidation tests for most hooks.

### Test Infrastructure
- `packages/react-sdk/src/__tests__/test-utils.tsx` — `renderWithProviders`, `createMockSigner`, `createMockRelayer`, `createMockStorage`. Returns `{ result, queryClient, signer, relayer, storage }` from `renderWithProviders`.

### Mutation Hook Implementations
| Hook | File | Invalidation Function |
|------|------|-----------------------|
| `useConfidentialTransfer` | `src/token/use-confidential-transfer.ts` | `invalidateBalanceQueries(context.client, tokenAddress)` |
| `useShield` | `src/token/use-shield.ts` | `invalidateAfterShield(context.client, tokenAddress)` |
| `useUnshield` | `src/token/use-unshield.ts` | `invalidateAfterUnshield(context.client, tokenAddress)` |
| `useUnshieldAll` | `src/token/use-unshield-all.ts` | `invalidateAfterUnshield(context.client, tokenAddress)` |
| `useUnwrap` | `src/token/use-unwrap.ts` | `invalidateBalanceQueries(context.client, tokenAddress)` |
| `useUnwrapAll` | `src/token/use-unwrap-all.ts` | `invalidateBalanceQueries(context.client, tokenAddress)` |
| `useFinalizeUnwrap` | `src/token/use-finalize-unwrap.ts` | `invalidateAfterUnshield(context.client, tokenAddress)` |
| `useApproveUnderlying` | `src/token/use-approve-underlying.ts` | `queryClient.invalidateQueries({ queryKey: zamaQueryKeys.underlyingAllowance.all })` |

### Cache Invalidation Logic (SDK Layer)
- `packages/sdk/src/query/invalidation.ts` — All invalidation helpers
- `packages/sdk/src/query/query-keys.ts` — `zamaQueryKeys` namespace

### Invalidation Function Breakdown

```
invalidateBalanceQueries(qc, tokenAddress):
  - invalidateQueries({ queryKey: zamaQueryKeys.confidentialHandle.token(tokenAddress) })
  - invalidateQueries({ queryKey: zamaQueryKeys.confidentialHandles.all })
  - resetQueries({ queryKey: zamaQueryKeys.confidentialBalance.token(tokenAddress) })
  - invalidateQueries({ queryKey: zamaQueryKeys.confidentialBalances.all })

invalidateAfterShield(qc, tokenAddress):
  - all of invalidateBalanceQueries
  - invalidateQueries({ queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress) })
  - invalidateWagmiBalanceQueries (predicate-based)

invalidateAfterUnshield(qc, tokenAddress):
  - all of invalidateBalanceQueries
  - invalidateQueries({ queryKey: zamaQueryKeys.underlyingAllowance.token(tokenAddress) })
  - invalidateWagmiBalanceQueries (predicate-based)

invalidateAfterApprove(qc, tokenAddress):
  - invalidateQueries({ queryKey: zamaQueryKeys.confidentialIsApproved.token(tokenAddress) })
```

**Note**: `useApproveUnderlying` invalidates `zamaQueryKeys.underlyingAllowance.all` (not the SDK helper `invalidateAfterApprove`).

---

## Test Pattern: Cache Invalidation (Rule 4)

From `TEST_UPDATE_PLAN.md` §Rule 4 and §PR Scope 2:

```tsx
test("cache: invalidates balance after transfer", async () => {
  const signer = createMockSigner();
  vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");

  const { result, queryClient } = renderWithProviders(
    () => useConfidentialTransfer({ tokenAddress: TOKEN }),
    { signer },
  );

  // 1. Seed the cache
  queryClient.setQueryData(zamaQueryKeys.confidentialHandle.token(TOKEN), "0xhandle");
  queryClient.setQueryData(
    zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, "0xhandle"),
    1000n,
  );

  // 2. Mutate
  await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n }));

  // 3. Assert cache was cleared (invalidated/reset → undefined)
  expect(queryClient.getQueryData(zamaQueryKeys.confidentialHandle.token(TOKEN))).toBeUndefined();
  expect(
    queryClient.getQueryData(zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, "0xhandle"))
  ).toBeUndefined();
});
```

**Key insight**: `invalidateQueries` marks as stale + removes from active observers, `resetQueries` actually removes data. Both leave `getQueryData` returning `undefined` for non-active queries (no observers). In test environment with no active query hooks observing, both will result in `undefined`.

---

## Per-Hook Cache Test Specifications

### `useConfidentialTransfer`
- **Seeds**: `confidentialHandle.token(TOKEN)`, `confidentialBalance.owner(TOKEN, USER, handle)`
- **Mutation**: `mutateAsync({ to: RECIPIENT, amount: 500n })`
- **Asserts**: handle key `undefined`, balance key `undefined`
- **Note**: signer needs `writeContract` mocked, `readContract` for signerAddress

### `useShield`
- **Seeds**: `confidentialBalance.owner(TOKEN, USER, handle)`, `underlyingAllowance.token(TOKEN)`
- **Mutation**: `mutateAsync({ amount: 500n })`
- **Asserts**: balance cleared, allowance cleared
- **Note**: signer needs `readContract` for underlying token address + allowance check

### `useUnshield`
- **Seeds**: `confidentialBalance.owner(TOKEN, USER, handle)`, `underlyingAllowance.token(TOKEN)`
- **Mutation**: `mutateAsync({ amount: 300n })`
- **Asserts**: balance cleared, allowance cleared

### `useUnshieldAll`
- **Seeds**: same as `useUnshield`
- **Mutation**: `mutateAsync()` (void)
- **Asserts**: balance cleared, allowance cleared

### `useUnwrap`
- **Seeds**: `confidentialHandle.token(TOKEN)`, `confidentialBalance.owner(TOKEN, USER, handle)`
- **Mutation**: `mutateAsync({ amount: 300n })`
- **Asserts**: handle key `undefined`, balance key `undefined`

### `useUnwrapAll`
- **Seeds**: `confidentialHandle.token(TOKEN)`, `confidentialBalance.owner(TOKEN, USER, handle)`
- **Mutation**: `mutateAsync()` (void)
- **Asserts**: handle key `undefined`, balance key `undefined`

### `useFinalizeUnwrap`
- **Seeds**: `confidentialBalance.owner(TOKEN, USER, handle)`, `underlyingAllowance.token(TOKEN)`
- **Mutation**: `mutateAsync({ burnAmountHandle: "0xburnHandle" as Address })`
- **Asserts**: balance cleared, allowance cleared

### `useApproveUnderlying`
- **Seeds**: `underlyingAllowance.all` namespace keys (use token-scoped key)
- **Mutation**: `mutateAsync({ amount: 1000n })`
- **Asserts**: `underlyingAllowance.token(TOKEN)` is `undefined`
- **Note**: Already has a spy-based test; needs data-observation version per Rule 4

---

## Test Naming Convention (Rule 7)

Current test names → New names:

| Current | New |
|---------|-----|
| `it("calls token.confidentialTransfer on mutate"...)` | `test('default')` |
| `it("provides mutate function"...)` | `test('default')` |
| `it("invalidates underlying allowance cache on success and calls user onSuccess"...)` | `test('cache: invalidates allowance after approve')` |
| `it("subtracts amount from cached balance on mutate when optimistic=true"...)` | `test('behavior: optimistic subtract on mutate')` |
| `it("does not modify cached balance when optimistic is not set"...)` | `test('behavior: no optimistic update without flag')` |
| `it("restores cached balance on error when optimistic=true without invalidation"...)` | `test('behavior: rolls back optimistic on error')` |

New tests to add use `test('cache: ...')` prefix.

---

## `default` Test with `toMatchInlineSnapshot` (Rule 3 + §PR Scope 5)

Each `default` test should snapshot the full TanStack mutation state:

```tsx
test('default', async () => {
  const { result } = renderWithProviders(
    () => useConfidentialTransfer({ tokenAddress: TOKEN }),
  );

  const { mutate, mutateAsync, ...rest } = result.current;
  expect(rest).toMatchInlineSnapshot(`
    {
      "context": undefined,
      "data": undefined,
      "error": null,
      "failureCount": 0,
      "failureReason": null,
      "isError": false,
      "isIdle": true,
      "isPending": false,
      "isSuccess": false,
      "isPaused": false,
      "reset": [Function],
      "status": "idle",
      "submittedAt": 0,
      "variables": undefined,
    }
  `);
});
```

**Note**: `mutate`, `mutateAsync`, `reset` are functions — exclude or snapshot as `[Function]`. The exact snapshot will need to be generated by running tests once with `toMatchInlineSnapshot()`.

---

## Mock Configuration for Each Hook

All mutation hooks use `useToken(config)` internally, which requires a signer. The signer's `readContract` is used for:
1. `signerAddress` query (to get `owner` address)
2. For `useShield`: reads underlying token address and allowance

Standard mock pattern:
```tsx
const signer = createMockSigner();
// createMockSigner already mocks getAddress → USER ("0x2222...2222")
vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
```

For hooks that need multi-step `readContract`:
```tsx
vi.mocked(signer.readContract)
  .mockResolvedValueOnce("0xaaaa...underlying" as Address)  // underlying token addr
  .mockResolvedValueOnce(0n);                               // current allowance
```

---

## Constants

From `test-utils.tsx`:
```
USER = "0x2222222222222222222222222222222222222222"
```

From `mutation-hooks.test.tsx`:
```
TOKEN = "0x1111111111111111111111111111111111111111"
WRAPPER = "0x4444444444444444444444444444444444444444"
RECIPIENT = "0x8888888888888888888888888888888888888888" (used in existing tests)
```

---

## Wagmi Reference (from TEST_UPDATE_PLAN.md)

- Pattern reference: `packages/react/src/hooks/useConnectorClient.test.tsx` L101–124
- "check `.data` becomes `undefined` after disconnect triggers `removeQueries`. No spies, pure data observation."
- Cache test pattern: setQueryData → mutate → getQueryData is undefined

---

## Existing Test Coverage (What's Already There)

The existing `mutation-hooks.test.tsx` already has:
1. ✓ `useConfidentialTransfer` — basic idle state check
2. ✓ `useConfidentialApprove` — basic idle state check
3. ✓ `useApproveUnderlying` — basic + invalidation spy test
4. ✓ `useShield` — basic idle state check
5. ✓ `useAuthorizeAll` — basic idle state check
6. ✓ `useEncrypt` — full mutation test with data assertion
7. ✓ `useConfidentialTransfer` optimistic update tests (3 scenarios)
8. ✓ `useShield` optimistic update tests (2 scenarios)

**Missing (to add)**:
- `test('cache: ...')` tests for ALL mutation hooks (transfer, shield, unshield, unwrap, unwrapAll, unshieldAll, finalizeUnwrap, approveUnderlying)
- `test('default')` with `toMatchInlineSnapshot` for all hooks
- Missing hooks in test file entirely: `useUnshield`, `useUnshieldAll`, `useUnwrap`, `useUnwrapAll`, `useFinalizeUnwrap`
- Renamed test names per convention

---

## Notes on `resetQueries` vs `invalidateQueries`

`invalidateBalanceQueries` uses `resetQueries` for `confidentialBalance.token(...)`. In test environment with no active subscribers, `resetQueries` removes cached data entirely, so `getQueryData` returns `undefined`. Same behavior as `invalidateQueries` for observability in tests.

---

## Files to NOT Modify
- `mutation-options.test.ts` — options layer tests (separate concern)
- `mutation-error-handling.test.ts` — error tests
- Any SDK-layer files
