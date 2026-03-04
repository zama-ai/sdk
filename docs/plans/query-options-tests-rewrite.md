# Plan: Rewrite Query Options Tests

## Work Type Assessment

**This is mechanical/housekeeping work.** No observable behavior changes — only test file modifications:
- Adding missing queryKey shape assertions (2 tests)
- Renaming `it()` → `test()` throughout (cosmetic, per Rule 7)

**TDD does not apply.** The work is entirely within the test file itself. The source code under test is unchanged.

## Current State

The test file (`packages/react-sdk/src/__tests__/query-options.test.ts`) already has:
- ✓ All enabled edge-case tests for `confidentialBalanceQueryOptions` (4 tests)
- ✓ All enabled edge-case tests for `confidentialBalancesQueryOptions` (5 tests)
- ✓ All enabled edge-case tests for `wrapperDiscoveryQueryOptions` (4 tests including default with key shape)
- ✓ Key shape tests for all other factories
- ✗ Missing: queryKey shape test for `confidentialBalanceQueryOptions`
- ✗ Missing: queryKey shape test for `confidentialBalancesQueryOptions`
- ✗ Uses `it()` instead of `test()` throughout

## Step-by-Step Changes

### Step 1: Rename `it()` → `test()` in import and all call sites

- **File**: `packages/react-sdk/src/__tests__/query-options.test.ts`
- Change import: `import { describe, expect, it } from "vitest"` → `import { describe, expect, test } from "vitest"`
- Replace all `it(` with `test(` (approximately 25 occurrences)

### Step 2: Add queryKey shape test for `confidentialBalanceQueryOptions`

Insert inside `describe("confidentialBalanceQueryOptions")` block, before the enabled tests:

```ts
test("default: key shape includes tokenAddress owner and handle", () => {
  const token = mockReadonlyToken(TOKEN_ADDR);
  const opts = confidentialBalanceQueryOptions(token, { owner: OWNER, handle: HANDLE });
  expect(opts.queryKey).toEqual([
    "zama.confidentialBalance",
    { tokenAddress: TOKEN_ADDR, owner: OWNER, handle: HANDLE },
  ]);
});
```

Note: Requires adding `HANDLE` constant at the top of the describe block (already exists as local const).

### Step 3: Add queryKey shape test for `confidentialBalancesQueryOptions`

Insert inside `describe("confidentialBalancesQueryOptions")` block, before the enabled tests:

```ts
test("default: key shape includes tokenAddresses owner and handles", () => {
  const tokens = [mockReadonlyToken(TOKEN_ADDR), mockReadonlyToken(TOKEN_B)];
  const opts = confidentialBalancesQueryOptions(tokens, {
    owner: OWNER,
    handles: [HANDLE_A, HANDLE_B],
  });
  expect(opts.queryKey).toEqual([
    "zama.confidentialBalances",
    {
      tokenAddresses: [TOKEN_ADDR, TOKEN_B],
      owner: OWNER,
      handles: [HANDLE_A, HANDLE_B],
    },
  ]);
});
```

Note: Uses existing `HANDLE_A`, `HANDLE_B`, `TOKEN_B` constants already defined in the describe block.

### Step 4: Verify test naming convention

Audit all test names to ensure none contain 'should', 'returns', or 'calls'. Current names already conform — they use prefixes like `default`, `parameters:`, `enabled:`.

### Step 5: Run tests

```bash
cd packages/react-sdk && bun run test query-options
```

Verify all tests pass.

## Files to Modify

| File | Changes |
|------|---------|
| `packages/react-sdk/src/__tests__/query-options.test.ts` | `it()` → `test()`, add 2 queryKey shape tests |

## Files to Create

None.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| queryKey shape mismatch with actual factory output | Key shapes are well-documented in query-keys.ts; research verified the exact shapes |
| `handle` param might be conditional in key (spread with undefined check) | query-keys.ts line 33 confirms: handle is included when defined, omitted when undefined |

## Verification Against Acceptance Criteria

1. **query-options.test.ts passes with bun run test** → Step 5
2. **confidentialBalanceQueryOptions enabled tests** → Already present (4 tests), verified in research
3. **confidentialBalancesQueryOptions enabled tests** → Already present (5 tests), verified in research
4. **wrapperDiscoveryQueryOptions enabled tests** → Already present (4 tests), verified in research
5. **All tests are synchronous** → No async code in any test, no renderHook, no providers
6. **No test names contain 'should', 'returns', or 'calls'** → Verified in Step 4
