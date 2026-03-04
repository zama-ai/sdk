# Test Suite Update Plan

## Context

After refactoring queries out of hooks for proper unit testing, we analyzed
wagmi's TanStack Query test suite as a reference implementation. This plan
captures the rules and concrete changes needed to reach wagmi-level test
quality.

Wagmi directory: /Users/msaug/zama/wagmi

---

## Testing Rules

### Rule 1: Two-Layer Testing — Always

Every query feature gets two test files:

| Layer       | File pattern        | Tests                                          | React? |
| ----------- | ------------------- | ---------------------------------------------- | ------ |
| **Options** | `*-options.test.ts` | Key shape, `enabled` computation, staleTime/gc | No     |
| **Hook**    | `*-hooks.test.tsx`  | State transitions, data flow, cache behavior   | Yes    |

Options tests are pure and synchronous — no providers, no async. Hook tests
use `renderWithProviders` and assert observable behavior.

> **Wagmi reference**:
>
> - Options layer: `packages/core/src/query/getBalance.test.ts` — snapshots `{ enabled, queryFn, queryKey }` statically
> - Hook layer: `packages/react/src/hooks/useBalance.test.ts` — same feature tested through rendered hook with full TanStack state
> - Both exist for the same feature (balance), testing at different abstraction levels

### Rule 2: Three Canonical Tests Per Query Hook

Every query hook MUST have at minimum:

```
1. test('default')                        → valid params → wait for success → snapshot full state
2. test('behavior: disabled when ...')    → missing params → isPending + fetchStatus: 'idle'
3. test('behavior: undefined → defined')  → start disabled → rerender with params → success
```

The transition test (3) is the most commonly missing. It catches bugs where
`enabled` guards don't react to prop changes.

> **Wagmi reference** — all three canonical tests in one file:
>
> - `packages/react/src/hooks/useBalance.test.ts`
>   - L17: `test('default')` — happy path
>   - L201: `test('behavior: disabled when properties missing')` — asserts `isPending: true`
>   - L114: `test('behavior: address: undefined -> defined')` — starts undefined, rerenders, waits for success
> - Same pattern repeated in `useBytecode.test.ts` (L7, L284, L197) and `useTransactionReceipt.test.ts` (L7, L233, L130)

### Rule 3: Snapshot the Full TanStack State

For the "default" success test of each hook, snapshot the **complete** return
object to catch regressions in `fetchStatus`, `isStale`, `dataUpdatedAt`, etc:

```tsx
const { data, ...rest } = result.current;
expect(data).toMatchObject({
  /* domain-specific assertions */
});
expect(rest).toMatchInlineSnapshot(`{ /* full TanStack state */ }`);
```

> **Wagmi reference**:
>
> - `packages/react/src/hooks/useBalance.test.ts` L22–63 — separates `data` from `rest`, snapshots 20+ TanStack flags including `fetchStatus`, `isStale`, `dataUpdatedAt`, `queryKey`
> - `packages/react/src/hooks/useConnectorClient.test.tsx` L63–96 — same split when `data` contains non-serializable objects
> - `packages/react/src/hooks/useTransactionReceipt.test.ts` L16–65 — full `result.current` inline snapshot when data is stable

### Rule 4: Test Invalidation by Observing Data, Not (Only) Spying

Primary assertion — seed cache, mutate, check data changed:

```tsx
queryClient.setQueryData(key, oldValue);
result.current.mutate({ ... });
await waitFor(() => expect(result.current.isSuccess).toBe(true));
expect(queryClient.getQueryData(key)).toBeUndefined(); // invalidated
```

Secondary assertion — spy confirms the right key was targeted:

```tsx
const spy = vi.spyOn(queryClient, "invalidateQueries");
// ... mutate ...
expect(spy).toHaveBeenCalledWith({ queryKey: expectedKey });
```

Both together give confidence that invalidation is called AND works.

> **Wagmi reference**:
>
> - `packages/react/src/hooks/useConnectorClient.test.tsx` L101–124: `test('behavior: connect and disconnect')` — checks `.data` becomes `undefined` after disconnect triggers `removeQueries`. No spies, pure data observation.
> - Same file L126–158: `test('behavior: switch chains')` — checks `.data.chain.id` changes after `switchChain` triggers `invalidateQueries`
> - The invalidation logic itself lives in `packages/react/src/hooks/useConnectorClient.ts` L38–48 (the `useEffect` with `addressRef`)

### Rule 5: Query Options Tests Cover Every `enabled` Edge Case

At the options layer (no React), test every combination that affects `enabled`:

```ts
test("enabled: false when owner missing", () => {
  const opts = confidentialBalanceQueryOptions({ tokenAddress: "0x..." });
  expect(opts.enabled).toBe(false);
});

test("enabled: respects user override", () => {
  const opts = confidentialBalanceQueryOptions({
    tokenAddress: "0x...",
    owner: "0x...",
    query: { enabled: false },
  });
  expect(opts.enabled).toBe(false);
});
```

> **Wagmi reference**:
>
> - `packages/core/src/query/getBalance.test.ts` L8 — `enabled: true` when `address` present
> - `packages/core/src/query/getConnectorClient.test.ts` L6–37 — `enabled: false` when no connector provided
> - `packages/core/src/query/estimateGas.test.ts` L7 — `enabled: false` when no account
> - The `enabled` guard pattern: `packages/core/src/query/getBalance.ts` L33: `Boolean(options.address && (options.query?.enabled ?? true))`

### Rule 6: Mock Shape, Not Behavior

- Mock at the **signer/relayer boundary** (dependency injection via provider)
- Never mock TanStack Query internals
- Never mock our own query options factories
- Mock return values must match real types (use `satisfies` or `as const`)
- No `vi.mock()` at module level in hook tests — inject through `createWrapper`

> **Wagmi reference**:
>
> - Zero `vi.mock()` calls across all of `packages/react/src/hooks/*.test.ts`
> - Dependencies injected via config: `packages/react/src/hooks/useReadContract.test.ts` L116–131 — passes `config` directly as hook parameter
> - Test infrastructure: `packages/test/src/exports/react.ts` — `renderHook` wraps with `WagmiProvider` holding pre-configured `config` from `packages/test/src/config.ts`

### Rule 7: Test Naming Convention

| Prefix                  | Meaning                               |
| ----------------------- | ------------------------------------- |
| `test('default')`       | Happy path, minimal params            |
| `test('parameters: X')` | Specific parameter variation          |
| `test('behavior: ...')` | Lifecycle / state transition behavior |
| `test('error: ...')`    | Error handling / propagation          |
| `test('cache: ...')`    | Cache invalidation / seeding behavior |

> **Wagmi reference** — naming convention across hook tests:
>
> - `packages/react/src/hooks/useBalance.test.ts` — `'default'` (L17), `'parameters: chainId'` (L66), `'behavior: address: undefined -> defined'` (L114), `'behavior: disabled when properties missing'` (L201)
> - `packages/react/src/hooks/useBytecode.test.ts` — `'parameters: blockNumber'` (L54), `'parameters: blockTag'` (L102), `'parameters: chainId'` (L150)
> - `packages/react/src/hooks/useConnectorClient.test.tsx` — `'behavior: connected on mount'` (L56), `'behavior: connect and disconnect'` (L101), `'behavior: switch chains'` (L126), `'behavior: re-render does not invalidate query'` (L179)

### Rule 8: Single `hashFn` Injection Point

`hashFn` is set in the test QueryClient's `defaultOptions.queries.queryKeyHashFn`.
Per-hook `queryKeyHashFn` props are defense-in-depth, not the primary mechanism.
Tests should assert that hooks pass `queryKeyHashFn: hashFn` to verify the
defense-in-depth layer.

> **Wagmi reference**:
>
> - Injection point: `packages/react/src/utils/query.ts` L66 — `queryKeyHashFn: hashFn` injected in the `useQuery` wrapper, and L109 for `useInfiniteQuery`
> - Definition: `packages/core/src/query/utils.ts` L8–21 — `hashFn` sorts object keys + converts bigints to strings
> - Implicit testing: `packages/react/src/hooks/useBalance.test.ts` L166 — `value: 10000000000000000000000n` in inline snapshot only works because `hashFn` serializes bigints correctly
> - No dedicated `hashFn` unit test in wagmi — behavior is tested indirectly through every hook test that uses bigint keys

---

## PR Scope: Concrete Changes

### 1. Add transition tests for all query hooks

**Files**: `query-hooks.test.tsx`, `token-hooks-extended.test.tsx`

Add `'behavior: undefined → defined'` tests for:

- [ ] `useConfidentialBalance` — signer unavailable → signer available → handle arrives → balance decrypts
- [ ] `useConfidentialBalances` — same three-phase transition
- [ ] `useUnderlyingAllowance` — no signer → signer available
- [ ] `useWrapperDiscovery` — no token address → address provided
- [ ] `useActivityFeed` — no token → token provided

Pattern:

```tsx
test("behavior: signer undefined → defined", async () => {
  const signer = createMockSigner();
  vi.mocked(signer.getAddress).mockRejectedValue(new Error("no signer"));

  const { result, rerender } = renderWithProviders(
    () => useConfidentialBalance({ tokenAddress: TOKEN }),
    { signer },
  );

  // Phase 1: disabled
  expect(result.current.isPending).toBe(true);
  expect(result.current.fetchStatus).toBe("idle");

  // Signer becomes available
  vi.mocked(signer.getAddress).mockResolvedValue(USER);
  rerender();

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
});
```

### 2. Add behavior-based cache invalidation tests

**Files**: `mutation-hooks.test.tsx`

For each mutation hook, add a `'cache: invalidates X after success'` test:

- [ ] `useConfidentialTransfer` — seed handle + balance cache → transfer → both gone
- [ ] `useShield` — seed balance cache → shield → cache reset
- [ ] `useUnshield` / `useUnwrap` / `useUnwrapAll` — seed cache → mutate → cache reset
- [ ] `useFinalizeUnwrap` — seed cache → finalize → cache reset
- [ ] `useApproveUnderlying` — seed allowance cache → approve → cache invalidated

Pattern:

```tsx
test("cache: invalidates balance after transfer", async () => {
  const { result, queryClient } = renderWithProviders(() => useConfidentialTransfer(config));

  // Seed the cache
  queryClient.setQueryData(zamaQueryKeys.confidentialHandle.token(TOKEN), "0xhandle");
  queryClient.setQueryData(zamaQueryKeys.confidentialBalance.owner(TOKEN, USER, "0xhandle"), 1000n);

  // Mutate
  await act(() => result.current.mutateAsync({ to: RECIPIENT, amount: 500n }));

  // Assert cache was cleared
  expect(queryClient.getQueryData(zamaQueryKeys.confidentialHandle.token(TOKEN))).toBeUndefined();
});
```

### 3. Add full two-phase lifecycle test

**File**: `query-hooks.test.tsx` (new describe block)

- [ ] Drive `useConfidentialBalance` end-to-end: signer resolves → handle poll returns → decrypt query fires → balance value available

```tsx
describe("useConfidentialBalance full lifecycle", () => {
  test("handle change triggers new decryption", async () => {
    const signer = createMockSigner();
    // First poll returns handle A
    vi.mocked(signer.readContract).mockResolvedValueOnce("0x" + "aa".repeat(32));

    const { result, rerender } = renderWithProviders(
      () => useConfidentialBalance({ tokenAddress: TOKEN }),
      { signer },
    );

    await waitFor(() => {
      // Handle query succeeded
      expect(result.current.handle).toBe("0x" + "aa".repeat(32));
    });

    // Second poll returns handle B (balance changed on-chain)
    vi.mocked(signer.readContract).mockResolvedValueOnce("0x" + "bb".repeat(32));

    // Trigger refetch (simulating polling interval)
    await act(() => result.current.refetchHandle());

    await waitFor(() => {
      expect(result.current.handle).toBe("0x" + "bb".repeat(32));
      // Decrypt query should have re-fired with new handle
    });
  });
});
```

### 4. Add "re-render doesn't invalidate" guard test

**File**: `query-hooks.test.tsx`

- [ ] `useConfidentialBalance` — data persists across re-render
- [ ] `useUserDecryptedValue` — cached value stable across re-render

```tsx
test("behavior: re-render preserves cached data", async () => {
  const { result, rerender, queryClient } = renderWithProviders(() =>
    useConfidentialBalance({ tokenAddress: TOKEN }),
  );

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  const firstData = result.current.data;

  rerender();

  // Same reference — no spurious refetch
  expect(result.current.data).toBe(firstData);
});
```

### 5. Adopt inline snapshots for default tests

**Files**: All hook test files

- [ ] Update each `test('default')` to use `toMatchInlineSnapshot` on the full TanStack state
- [ ] Separate `data` (use `toMatchObject`) from metadata (use `toMatchInlineSnapshot`)

### 6. Add missing `enabled` edge cases at options layer

**File**: `query-options.test.ts`

- [ ] `confidentialBalanceQueryOptions` — enabled when owner + handle present, disabled otherwise
- [ ] `confidentialBalancesQueryOptions` — enabled only when handles length matches tokens length
- [ ] `wrapperDiscoveryQueryOptions` — disabled when tokenAddress missing
- [ ] All options — `query.enabled: false` overrides internal enabled

### 7. Normalize test naming

**All test files**: Rename existing tests to follow the convention:

- `'should stay disabled when...'` → `'behavior: disabled when ...'`
- `'calls invalidateQueries...'` → `'cache: invalidates X after Y'`
- `'returns correct data'` → `'default'`

---

## Priority Order

| #   | Change                                   | Risk if skipped                              |
| --- | ---------------------------------------- | -------------------------------------------- |
| 1   | Transition tests (`undefined → defined`) | Bugs in `enabled` reactivity go undetected   |
| 2   | Behavior-based invalidation tests        | Invalidation with wrong keys passes silently |
| 3   | Full two-phase lifecycle test            | Handle→decrypt pipeline untested end-to-end  |
| 4   | Re-render stability tests                | Spurious refetches cause perf regressions    |
| 5   | Inline snapshots on defaults             | State shape regressions slip through         |
| 6   | Options-layer `enabled` edge cases       | Factory guards tested only through React     |
| 7   | Test naming normalization                | Consistency / readability                    |

We will not care for backward compatibility for the time being. We will do a full transition, we can completely rewrite the tests in this pass.
