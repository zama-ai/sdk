# Research: SDK Query Factories — ISSUE-002, ISSUE-004, ISSUE-005

## Overview

Three related fixes to `packages/sdk/src/query/` must be co-located to avoid merge conflicts:

1. **ISSUE-002** – Add `normalizeHandle` normalization in `confidential-handle.ts` and `confidential-handles.ts`; export `normalizeHandle` as a standalone utility.
2. **ISSUE-004** – Fix spread order in all ~15 query factory files to match the wagmi pattern (filterQueryOptions first, factory properties last).
3. **ISSUE-005** – Add `coordinatorAddress` to the `wrapperDiscovery` query key so `queryFn` reads from `context.queryKey` instead of the closure.

---

## ISSUE-002: Missing `normalizeHandle`

### Root Cause

`confidential-handle.ts` and `confidential-handles.ts` call `signer.readContract<Address>(...)` directly, bypassing the `normalizeHandle()` method in `ReadonlyToken`.

```ts
// packages/sdk/src/query/confidential-handle.ts (current, broken)
queryFn: async (context) => {
  const [, { tokenAddress: keyTokenAddress, owner: keyOwner }] = context.queryKey;
  return signer.readContract<Address>(
    confidentialBalanceOfContract(keyTokenAddress as Address, keyOwner as Address),
  );
  // ❌ raw result — no normalizeHandle
},
```

### The `normalizeHandle` Logic (from `readonly-token.ts:501-508`)

```ts
protected normalizeHandle(value: unknown): Address {
  if (typeof value === "string" && value.startsWith("0x")) return value as Address;
  if (typeof value === "bigint") return `0x${value.toString(16).padStart(64, "0")}`;
  return ZERO_HANDLE;
}
```

`ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000"` (readonly-token.ts:25).

### Fix Plan

- Extract a standalone `normalizeHandle(value: unknown): Address` function in `packages/sdk/src/query/utils.ts` (or a new `packages/sdk/src/query/normalize.ts`).
- Export it from `packages/sdk/src/query/index.ts`.
- Call it in the `queryFn` of both `confidential-handle.ts` and `confidential-handles.ts`.
- Write tests asserting:
  - bigint input → padded 64-char hex string
  - hex string input → returned as-is
  - other input → `ZERO_HANDLE`

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/sdk/src/query/confidential-handle.ts` | Add `normalizeHandle` call in `queryFn` |
| `packages/sdk/src/query/confidential-handles.ts` | Add `normalizeHandle` call per-result in `Promise.all` map |
| `packages/sdk/src/query/utils.ts` | Add exported `normalizeHandle` function |
| `packages/sdk/src/query/index.ts` | Export `normalizeHandle` |
| `packages/sdk/src/token/readonly-token.ts:25,501-508` | Source of logic and `ZERO_HANDLE` constant |
| `packages/sdk/src/query/__tests__/confidential-handle.test.ts` | Existing tests; add normalization test |
| `packages/sdk/src/query/__tests__/confidential-handles.test.ts` | Existing tests; add normalization test |
| `packages/sdk/src/query/__tests__/utils.test.ts` | Add `normalizeHandle` unit tests |

---

## ISSUE-004: Factory Spread Order Inverted

### Root Cause

All 15 factory files use the inverted spread pattern: factory properties come first, `filterQueryOptions` spread comes last. This contradicts the wagmi pattern specified in `TASK_1.md:57-78`.

```ts
// CURRENT (wrong) — factory props first, user overrides ignored for factory-set keys
return {
  queryKey,
  queryFn: async (context) => { ... },
  staleTime: Infinity,
  enabled: config?.query?.enabled !== false,
  ...filterQueryOptions(config?.query ?? {}),  // spreads last but strips enabled/queryKey/queryFn anyway
};

// CORRECT (wagmi pattern) — user overrides spread first, factory wins
return {
  ...filterQueryOptions(config?.query ?? {}),  // user opts spread first
  queryKey,                                    // factory always overrides
  queryFn: async (context) => { ... },
  enabled: ...,
};
```

### Why It Matters

`filterQueryOptions` strips `enabled`, `queryKey`, `queryFn`, `staleTime`, `refetchInterval`, etc. from the spread. So if a user passes `staleTime` in their `query` options, with the current wrong order the factory's `staleTime: Infinity` runs first, then `filterQueryOptions` strips the user's `staleTime` from the spread — the user can't override it. With the correct wagmi order, non-stripped behavioral options could pass through (but factory-declared ones still win). More importantly, it aligns code with the stated contract.

### Affected Files (15 factory files)

```
packages/sdk/src/query/activity-feed.ts
packages/sdk/src/query/confidential-balance.ts
packages/sdk/src/query/confidential-balances.ts
packages/sdk/src/query/confidential-handle.ts
packages/sdk/src/query/confidential-handles.ts
packages/sdk/src/query/confidential-is-approved.ts
packages/sdk/src/query/fees.ts             (4 functions inside)
packages/sdk/src/query/is-confidential.ts
packages/sdk/src/query/public-key.ts
packages/sdk/src/query/public-params.ts
packages/sdk/src/query/signer-address.ts
packages/sdk/src/query/token-metadata.ts
packages/sdk/src/query/total-supply.ts
packages/sdk/src/query/underlying-allowance.ts
packages/sdk/src/query/wrapper-discovery.ts
```

### Fix Pattern (mechanical)

In each `return { ... }` block, move `...filterQueryOptions(config?.query ?? {})` to be the first spread:

```ts
return {
  ...filterQueryOptions(config?.query ?? {}),   // ← move this to be FIRST
  queryKey,
  queryFn: async (context) => { ... },
  // staleTime, refetchInterval, etc.
  enabled: ...,
};
```

### Test Strategy

For each factory test, add a test confirming that user-supplied `staleTime` from `query` options is NOT overriding factory-set properties (the factory still wins), verifying the order is correct. A simpler approach: verify that passing `{ query: { staleTime: 999 } }` does not bleed the `staleTime` key through into the returned options (since `filterQueryOptions` strips it), proving the spread is doing what it should.

---

## ISSUE-005: `wrapperDiscovery` coordinator from closure

### Root Cause

The `wrapperDiscoveryQueryOptions` factory is categorized as "decoupled" (takes `signer + address`) but reads `coordinatorAddress` from the closure rather than from `context.queryKey`. This violates the TASK_1 rule: "Decoupled factories extract all data params from `context.queryKey`."

```ts
// wrapper-discovery.ts (current, broken)
const queryKey = zamaQueryKeys.wrapperDiscovery.token(tokenAddress);
// queryKey = ["zama.wrapperDiscovery", { tokenAddress }]
// ❌ coordinatorAddress NOT in key

queryFn: async (context) => {
  const [, { tokenAddress: keyTokenAddress }] = context.queryKey;
  const exists = await signer.readContract<boolean>(
    wrapperExistsContract(config.coordinatorAddress, keyTokenAddress as Address), // closure!
  );
  ...
  return signer.readContract<Address>(
    getWrapperContract(config.coordinatorAddress, keyTokenAddress as Address),   // closure!
  );
},
```

### Fix Plan

1. Update `zamaQueryKeys.wrapperDiscovery.token` to accept `coordinatorAddress` as a second param:
   ```ts
   token: (tokenAddress: string, coordinatorAddress: string) =>
     ["zama.wrapperDiscovery", { tokenAddress, coordinatorAddress }] as const,
   ```
2. Update `wrapperDiscoveryQueryOptions` to pass `config.coordinatorAddress` to the key builder.
3. Update `queryFn` to read `coordinatorAddress` from `context.queryKey`:
   ```ts
   queryFn: async (context) => {
     const [, { tokenAddress: keyTokenAddress, coordinatorAddress: keyCoordinator }] = context.queryKey;
     const exists = await signer.readContract<boolean>(
       wrapperExistsContract(keyCoordinator as Address, keyTokenAddress as Address),
     );
     if (!exists) return null;
     return signer.readContract<Address>(
       getWrapperContract(keyCoordinator as Address, keyTokenAddress as Address),
     );
   },
   ```

### Relevant Files

| File | Purpose |
|------|---------|
| `packages/sdk/src/query/query-keys.ts:72-75` | Update `wrapperDiscovery.token` key to include `coordinatorAddress` |
| `packages/sdk/src/query/wrapper-discovery.ts` | Pass coordinator to key; read from key in queryFn |
| `packages/sdk/src/query/__tests__/wrapper-discovery.test.ts` | Existing tests (currently don't test key-param alignment); add new alignment test |
| `packages/sdk/src/query/__tests__/query-keys.test.ts` | Update key shape test if present |

### Downstream Impact

Any call site of `zamaQueryKeys.wrapperDiscovery.token(tokenAddress)` will need to be updated to include `coordinatorAddress`. Check:
- `packages/sdk/src/query/invalidation.ts`
- Any React hooks that call `wrapperDiscoveryQueryOptions`

---

## `filterQueryOptions` Behavior Reference

`filterQueryOptions` (in `utils.ts`) strips these TanStack behavioral keys from user-supplied `query` options:

```
gcTime, staleTime, enabled, select, refetchInterval, refetchOnMount,
refetchOnWindowFocus, refetchOnReconnect, retry, retryDelay, retryOnMount,
queryFn, queryKey, queryKeyHashFn, initialData, initialDataUpdatedAt,
placeholderData, structuralSharing, throwOnError, meta, query, pollingInterval
```

So `queryKey`, `queryFn`, and `enabled` can never be overridden by user options regardless of spread order. However the wagmi pattern still mandates factory-first override for semantic correctness and future-proofing.

---

## `QueryFactoryOptions` Type Reference

```ts
// factory-types.ts
export interface QueryFactoryOptions<TQueryKey extends readonly unknown[], TData> {
  queryKey: TQueryKey;
  queryFn: (context: QueryContext<TQueryKey>) => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}
```

The type does not currently include all possible passthrough fields. The spread from `filterQueryOptions` returns `Omit<TOptions, StrippedQueryOptionKeys>`, which means non-stripped user options (e.g., custom metadata fields) would currently be dropped by the return type. Consider whether `QueryFactoryOptions` should be extended to allow `[key: string]: unknown`.

---

## Test Infrastructure

- Test helper: `packages/sdk/src/query/__tests__/test-helpers.ts`
  - `createMockSigner()` — returns `GenericSigner` with vi.fn() mocks
  - `createMockSigner().readContract` is a `vi.fn()` that can be `.mockResolvedValue(...)` / `.mockResolvedValueOnce(...)`
- Framework: vitest
- Pattern: `describe` + `test`, spy on `signer.readContract`, verify call args with `toMatchObject`

---

## File Map Summary

```
packages/sdk/src/query/
├── utils.ts                    ← ADD normalizeHandle, export it
├── index.ts                    ← ADD export for normalizeHandle
├── query-keys.ts               ← UPDATE wrapperDiscovery.token() to accept coordinatorAddress
├── confidential-handle.ts      ← ISSUE-002 (normalizeHandle) + ISSUE-004 (spread order)
├── confidential-handles.ts     ← ISSUE-002 (normalizeHandle) + ISSUE-004 (spread order)
├── wrapper-discovery.ts        ← ISSUE-004 (spread order) + ISSUE-005 (coordinator key)
├── activity-feed.ts            ← ISSUE-004 (spread order)
├── confidential-balance.ts     ← ISSUE-004 (spread order)
├── confidential-balances.ts    ← ISSUE-004 (spread order)
├── confidential-is-approved.ts ← ISSUE-004 (spread order)
├── fees.ts                     ← ISSUE-004 (spread order, 4 functions)
├── is-confidential.ts          ← ISSUE-004 (spread order)
├── public-key.ts               ← ISSUE-004 (spread order)
├── public-params.ts            ← ISSUE-004 (spread order)
├── signer-address.ts           ← ISSUE-004 (spread order)
├── token-metadata.ts           ← ISSUE-004 (spread order)
├── total-supply.ts             ← ISSUE-004 (spread order)
├── underlying-allowance.ts     ← ISSUE-004 (spread order)
└── __tests__/
    ├── confidential-handle.test.ts   ← ADD normalizeHandle bigint test
    ├── confidential-handles.test.ts  ← ADD normalizeHandle bigint test
    ├── utils.test.ts                 ← ADD normalizeHandle unit tests
    └── wrapper-discovery.test.ts     ← ADD coordinator-key alignment test
```

---

## Key Constraints & Gotchas

1. **`normalizeHandle` must handle `bigint` from ethers.js ABI decoding** — ethers returns `BigInt` for `uint256` reads (e.g., `confidentialBalanceOf` which returns `bytes32` but is sometimes decoded as `uint256`).
2. **Spread order changes are mechanical** — no logic changes, just reorder the `return { ... }` block.
3. **`wrapperDiscovery` key change is a breaking change** — any existing cached data under the old key format will be invalidated. Existing tests in `wrapper-discovery.test.ts` use `options.queryKey` directly, so they will pass through the fix automatically if the factory is updated consistently.
4. **`invalidation.ts` may reference `zamaQueryKeys.wrapperDiscovery`** — check for `.all` usage which won't need coordinator.
5. **Export of `normalizeHandle`** — must be added to `index.ts` alongside `filterQueryOptions` and `hashFn`.
