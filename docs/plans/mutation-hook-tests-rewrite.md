# Plan: Mutation Hook Tests Rewrite

**Unit**: mutation-hook-tests-rewrite
**Date**: 2026-03-04

## Work Type Assessment

**TDD does not apply.** This is a test-only rewrite — we are writing tests, not production code. The work is:
- Adding missing test coverage (cache invalidation tests)
- Reformatting existing tests (inline snapshots, naming convention)
- No production code changes

**Verification**: `bun run test` passes, acceptance criteria met by inspection.

---

## Overview

Complete rewrite of `packages/react-sdk/src/__tests__/mutation-hooks.test.tsx` to add cache invalidation tests for all 7 mutation hooks, convert `default` tests to use `toMatchInlineSnapshot`, and rename all tests to follow naming conventions.

---

## Step-by-Step Changes

### Step 1: Add missing hook imports

Add imports for the 5 hooks not currently imported:

```ts
import { useUnshield } from "../token/use-unshield";
import { useUnshieldAll } from "../token/use-unshield-all";
import { useUnwrap } from "../token/use-unwrap";
import { useUnwrapAll } from "../token/use-unwrap-all";
import { useFinalizeUnwrap } from "../token/use-finalize-unwrap";
```

Also import `USER` from `test-utils` (needed for `confidentialBalance.owner()` key construction).

### Step 2: Add RECIPIENT constant

```ts
const RECIPIENT = "0x8888888888888888888888888888888888888888" as Address;
```

Extract from inline usage in existing tests.

### Step 3: Rename existing tests to follow naming convention

| Current | New |
|---------|-----|
| `it("calls token.confidentialTransfer on mutate"...)` | `test("default", ...)` |
| `it("provides mutate function"...)` (useConfidentialApprove) | `test("default", ...)` |
| `it("provides mutate function"...)` (useApproveUnderlying) | `test("default", ...)` |
| `it("invalidates underlying allowance cache on success...")` | `test("cache: invalidates allowance after approve", ...)` |
| `it("provides mutate function"...)` (useShield) | `test("default", ...)` |
| `it("provides mutate function"...)` (useAuthorizeAll) | `test("default", ...)` |
| `it("calls relayer.encrypt on mutate"...)` | `test("default", ...)` |
| `it("subtracts amount from cached balance...")` | `test("behavior: optimistic subtract on mutate", ...)` |
| `it("does not modify cached balance...")` | `test("behavior: no optimistic update without flag", ...)` |
| `it("restores cached balance on error...")` | `test("behavior: rolls back optimistic on error", ...)` |
| `it("adds amount to cached balance...")` | `test("behavior: optimistic add on mutate", ...)` |
| `it("restores cached balance snapshot...")` | `test("behavior: rolls back optimistic on error", ...)` |

**Rule**: No test names contain 'should', 'returns', or 'calls'. Use `test()` not `it()`.

### Step 4: Convert all `default` tests to use `toMatchInlineSnapshot`

For each existing basic test (useConfidentialTransfer, useConfidentialApprove, useApproveUnderlying, useShield, useAuthorizeAll), replace manual assertions with:

```tsx
test("default", () => {
  const { result } = renderWithProviders(() => useHook({ ... }));
  const { mutate, mutateAsync, reset, ...rest } = result.current;
  expect(rest).toMatchInlineSnapshot(`...`);
});
```

Leave the inline snapshot empty on first pass — run `bun test -u` to populate.

For `useEncrypt`'s default test, keep the full mutation flow but rename.

### Step 5: Replace spy-based `useApproveUnderlying` invalidation test with data-observation

Replace the existing spy-based test with the cache pattern:

```tsx
test("cache: invalidates allowance after approve", async () => {
  const signer = createMockSigner();
  vi.mocked(signer.readContract)
    .mockResolvedValueOnce("0xaaaa..." as Address) // underlying token
    .mockResolvedValueOnce(0n);                    // current allowance

  const { result, queryClient } = renderWithProviders(
    () => useApproveUnderlying({ tokenAddress: TOKEN, wrapperAddress: WRAPPER }),
    { signer },
  );

  // Seed cache
  queryClient.setQueryData(zamaQueryKeys.underlyingAllowance.token(TOKEN), 500n);

  // Mutate
  await act(() => result.current.mutateAsync({ amount: 1000n }));

  // Assert cleared
  expect(queryClient.getQueryData(zamaQueryKeys.underlyingAllowance.token(TOKEN))).toBeUndefined();
});
```

### Step 6: Add cache invalidation test for `useConfidentialTransfer`

```tsx
test("cache: invalidates balance after transfer", async () => {
  // Seeds: confidentialHandle.token(TOKEN), confidentialBalance.owner(TOKEN, USER, "0xhandle")
  // Mutation: mutateAsync({ to: RECIPIENT, amount: 500n })
  // Asserts: both keys → undefined
});
```

Invalidation function: `invalidateBalanceQueries` → clears handle + balance keys.

### Step 7: Add cache invalidation test for `useShield`

```tsx
test("cache: invalidates balance and allowance after shield", async () => {
  // Seeds: confidentialBalance.owner(TOKEN, USER, "0xhandle"), underlyingAllowance.token(TOKEN)
  // Mutation: mutateAsync({ amount: 500n })
  // Asserts: balance cleared, allowance cleared
  // Mock: signer.readContract for underlying token addr + allowance
});
```

Invalidation function: `invalidateAfterShield` → balance + allowance + wagmi.

### Step 8: Add `useUnshield` describe block with default + cache test

```tsx
describe("useUnshield", () => {
  test("default", () => { ... toMatchInlineSnapshot ... });

  test("cache: invalidates balance and allowance after unshield", async () => {
    // Seeds: confidentialBalance.owner(TOKEN, USER, "0xhandle"), underlyingAllowance.token(TOKEN)
    // Mutation: mutateAsync({ amount: 300n })
    // Asserts: balance cleared, allowance cleared
  });
});
```

Invalidation function: `invalidateAfterUnshield`.

### Step 9: Add `useUnshieldAll` describe block with default + cache test

```tsx
describe("useUnshieldAll", () => {
  test("default", () => { ... toMatchInlineSnapshot ... });

  test("cache: invalidates balance and allowance after unshield all", async () => {
    // Seeds: same as useUnshield
    // Mutation: mutateAsync() — void
    // Asserts: balance cleared, allowance cleared
  });
});
```

### Step 10: Add `useUnwrap` describe block with default + cache test

```tsx
describe("useUnwrap", () => {
  test("default", () => { ... toMatchInlineSnapshot ... });

  test("cache: invalidates balance after unwrap", async () => {
    // Seeds: confidentialHandle.token(TOKEN), confidentialBalance.owner(TOKEN, USER, "0xhandle")
    // Mutation: mutateAsync({ amount: 300n })
    // Asserts: handle + balance → undefined
  });
});
```

Invalidation function: `invalidateBalanceQueries`.

### Step 11: Add `useUnwrapAll` describe block with default + cache test

```tsx
describe("useUnwrapAll", () => {
  test("default", () => { ... toMatchInlineSnapshot ... });

  test("cache: invalidates balance after unwrap all", async () => {
    // Seeds: confidentialHandle.token(TOKEN), confidentialBalance.owner(TOKEN, USER, "0xhandle")
    // Mutation: mutateAsync() — void
    // Asserts: handle + balance → undefined
  });
});
```

### Step 12: Add `useFinalizeUnwrap` describe block with default + cache test

```tsx
describe("useFinalizeUnwrap", () => {
  test("default", () => { ... toMatchInlineSnapshot ... });

  test("cache: invalidates balance and allowance after finalize", async () => {
    // Seeds: confidentialBalance.owner(TOKEN, USER, "0xhandle"), underlyingAllowance.token(TOKEN)
    // Mutation: mutateAsync({ burnAmountHandle: "0xburnHandle" as Address })
    // Asserts: balance cleared, allowance cleared
  });
});
```

Invalidation function: `invalidateAfterUnshield`.

### Step 13: Run tests, populate inline snapshots

```bash
cd packages/react-sdk && bun test src/__tests__/mutation-hooks.test.tsx -u
```

This populates empty `toMatchInlineSnapshot()` calls with actual values. Then verify snapshots look correct (TanStack metadata shape).

### Step 14: Final verification

Run full test suite:
```bash
bun run test
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/react-sdk/src/__tests__/mutation-hooks.test.tsx` | Complete rewrite — all changes above |

## Files to Create

None.

---

## Mock Pattern for Cache Tests

All cache tests follow the same skeleton:

```tsx
test("cache: invalidates X after Y", async () => {
  const signer = createMockSigner();
  vi.mocked(signer.writeContract).mockResolvedValue("0xtxhash");
  // Additional readContract mocks if needed (useShield, useUnshield, useUnshieldAll, useFinalizeUnwrap)

  const { result, queryClient } = renderWithProviders(
    () => useHook({ tokenAddress: TOKEN, /* wrapperAddress if needed */ }),
    { signer },
  );

  // 1. Seed cache
  queryClient.setQueryData(key1, value1);
  queryClient.setQueryData(key2, value2);

  // 2. Mutate
  await act(() => result.current.mutateAsync(params));

  // 3. Assert invalidated
  expect(queryClient.getQueryData(key1)).toBeUndefined();
  expect(queryClient.getQueryData(key2)).toBeUndefined();
});
```

### Per-hook mock requirements

| Hook | Needs `readContract` mocks? | Needs `wrapperAddress`? |
|------|----------------------------|------------------------|
| useConfidentialTransfer | Yes (handle read) | No |
| useShield | Yes (underlying addr + allowance) | Yes |
| useUnshield | Yes (handle read) | No |
| useUnshieldAll | Yes (handle read) | No |
| useUnwrap | Yes (handle read) | No |
| useUnwrapAll | Yes (handle read) | No |
| useFinalizeUnwrap | No (just writeContract) | No |
| useApproveUnderlying | Yes (underlying addr + allowance) | Yes |

---

## Risks and Mitigations

1. **Inline snapshots may differ from expected** — Run `bun test -u` to auto-populate, then review. The `reset` function may or may not appear depending on TanStack version.

2. **`mutateAsync` may throw if mock chain is incomplete** — Each hook's internal `mutationFn` calls different signer methods. If `readContract` isn't mocked correctly, the mutation will reject. Mitigation: follow the existing mock patterns from optimistic tests.

3. **`invalidateQueries` vs `resetQueries` behavior** — Both result in `getQueryData` returning `undefined` for queries with no active observers (test environment). This is verified in the research doc.

4. **`hashFn` for query key matching** — The test QueryClient uses `hashFn` from `@zama-fhe/sdk/query` as `queryKeyHashFn`. This means `setQueryData` and `getQueryData` keys must use the same `zamaQueryKeys` factories. Already the pattern in existing tests.

5. **`useUnshield` orchestrates unwrap→finalize** — Its mutation function may call multiple signer operations. Mock `writeContract` to resolve for all calls (`.mockResolvedValue` covers repeated calls).

---

## Acceptance Criteria Verification

| # | Criteria | How Verified |
|---|---------|-------------|
| 1 | Tests pass with `bun run test` | Run after rewrite |
| 2 | 7 hooks have `cache: invalidates...` test | Grep for `cache: invalidates` — expect 7+ matches |
| 3 | Cache tests use setQueryData→mutateAsync→getQueryData undefined | Code review of each test |
| 4 | Every `default` test uses toMatchInlineSnapshot | Grep for `toMatchInlineSnapshot` in default tests |
| 5 | No 'should', 'returns', 'calls' in test names | `grep -E "(should|returns|calls)" mutation-hooks.test.tsx` returns empty |
| 6 | No `vi.mock()` at module level | Grep for `vi.mock(` at top of file — should be absent |
