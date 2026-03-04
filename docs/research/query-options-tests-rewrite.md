# Research: Query Options Tests Rewrite — Unit: query-options-tests-rewrite

## Overview

This unit covers a **complete rewrite** of
`packages/react-sdk/src/__tests__/query-options.test.ts`.

Goals:
1. Pure, synchronous tests — no React, no providers, no `renderHook`.
2. Exhaustive `enabled` edge-case coverage for every query options factory.
3. Key-shape assertions for every factory.
4. Rename all existing tests to the canonical naming convention (§Rule 7).

---

## RFC Sections (from TEST_UPDATE_PLAN.md)

### §PR Scope 6 — Add missing `enabled` edge cases at options layer

**File**: `packages/react-sdk/src/__tests__/query-options.test.ts`

Required coverage:
- `confidentialBalanceQueryOptions` — enabled when owner + handle present, disabled when either missing
- `confidentialBalancesQueryOptions` — enabled only when `handles.length === tokens.length`, disabled otherwise
- `wrapperDiscoveryQueryOptions` — disabled when `tokenAddress` missing
- All options factories — `query: { enabled: false }` overrides internal enabled computation

### §PR Scope 7 — Normalize test naming

Rename existing tests to follow convention:

| Old naming | New naming |
|---|---|
| `'should stay disabled when...'` | `'behavior: disabled when ...'` |
| `'returns correct data'` | `'default'` |
| `'calls invalidateQueries...'` | `'cache: invalidates X after Y'` |

### §Rule 1 — Two-Layer Testing

Options tests are pure and synchronous — **no providers, no async**.

### §Rule 5 — Query Options Tests Cover Every `enabled` Edge Case

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

---

## Existing Test File

**Path**: `packages/react-sdk/src/__tests__/query-options.test.ts`

The existing file already has **substantial coverage** that was added in a
previous pass. The task is to verify completeness and rename any non-conforming
test names.

### Current state of `confidentialBalanceQueryOptions` tests (lines 107–141)

Already present — ✓ VERIFIED:
- `"enabled: true when owner and handle are present"` ✓
- `"enabled: false when owner is missing"` ✓
- `"enabled: false when handle is missing"` ✓
- `"enabled: false when query override is disabled"` ✓

Missing key-shape assertion: No `queryKey` shape test exists for
`confidentialBalanceQueryOptions`. Should assert:
```ts
expect(opts.queryKey).toEqual([
  "zama.confidentialBalance",
  { tokenAddress: TOKEN_ADDR, owner: OWNER, handle: HANDLE },
]);
```

### Current state of `confidentialBalancesQueryOptions` tests (lines 143–198)

Already present — ✓ VERIFIED:
- `"enabled: true when handle count matches token count"` ✓
- `"enabled: false when handle count differs from token count"` ✓
- `"enabled: false when owner is missing"` ✓
- `"enabled: false when token list is empty"` ✓
- `"enabled: false when query override is disabled"` ✓

Missing key-shape assertion: No `queryKey` shape test exists for
`confidentialBalancesQueryOptions`.

### Current state of `wrapperDiscoveryQueryOptions` tests (lines 200–241)

Already present — ✓ VERIFIED:
- `"default"` (key shape + staleTime) ✓
- `"enabled: false when tokenAddress is missing"` ✓
- `"enabled: true when tokenAddress is present"` ✓
- `"enabled: false when query override is disabled"` ✓

### Summary: What's Actually Missing

The test file is **more complete than the ticket implies**. The main remaining
work is:

1. **Key-shape assertions** for `confidentialBalanceQueryOptions` and
   `confidentialBalancesQueryOptions`.
2. **Test naming normalization** — existing tests use `it()` not `test()` (minor
   stylistic, can normalize).
3. Verify that the test file description blocks use `describe` correctly.

---

## Implementation Source Files

### Query Options Factories

#### `confidentialBalanceQueryOptions`
**Source**: `packages/sdk/src/query/confidential-balance.ts`

```ts
enabled: Boolean(ownerKey && handleKey) && config?.query?.enabled !== false
```

Key shape: `zamaQueryKeys.confidentialBalance.owner(token.address, ownerKey, handleKey)`
→ `["zama.confidentialBalance", { tokenAddress, owner, handle }]`

#### `confidentialBalancesQueryOptions`
**Source**: `packages/sdk/src/query/confidential-balances.ts`

```ts
enabled:
  Boolean(ownerKey) &&
  tokens.length > 0 &&
  handlesReady &&        // handles.length === tokens.length && every handle is truthy
  config?.query?.enabled !== false
```

Key shape: `zamaQueryKeys.confidentialBalances.tokens(tokenAddresses, ownerKey, config?.handles)`
→ `["zama.confidentialBalances", { tokenAddresses, owner, handles? }]`

#### `wrapperDiscoveryQueryOptions`
**Source**: `packages/sdk/src/query/wrapper-discovery.ts`

```ts
enabled: Boolean(tokenAddress) && config.query?.enabled !== false
```

Key shape: `zamaQueryKeys.wrapperDiscovery.token(tokenAddress, coordinatorAddress)`
→ `["zama.wrapperDiscovery", { tokenAddress, coordinatorAddress }]`

### Query Keys
**Source**: `packages/sdk/src/query/query-keys.ts`

All keys are `["zama.<namespace>", { ...params }]` tuples. Key constructors:
- `zamaQueryKeys.confidentialBalance.owner(tokenAddress, owner, handle?)`
- `zamaQueryKeys.confidentialBalances.tokens(tokenAddresses, owner, handles?)`
- `zamaQueryKeys.wrapperDiscovery.token(tokenAddress, coordinatorAddress)`

### Factory Types
**Source**: `packages/sdk/src/query/factory-types.ts`

```ts
interface QueryFactoryOptions<TQueryKey, TData> {
  queryKey: TQueryKey;
  queryFn: (context) => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}
```

### Test Utilities
**Source**: `packages/react-sdk/src/__tests__/test-utils.tsx`

- `createMockSigner()` — returns `GenericSigner` mock
- `createMockRelayer()` — returns `RelayerSDK` mock
- `createMockStorage()` — returns `GenericStringStorage` mock
- `createWrapper(overrides?)` — creates `QueryClient` + `ZamaProvider` wrapper
- `renderWithProviders(hook, overrides?)` — **NOT needed** for options tests

---

## Test Conventions

From §Rule 7:

| Prefix | Meaning |
|---|---|
| `test('default')` | Happy path, minimal params |
| `test('parameters: X')` | Specific parameter variation |
| `test('behavior: ...')` | Lifecycle / state transition |
| `test('enabled: ...')` | enabled guard result |

For options-layer tests, the dominant prefixes are:
- `test('default')` — key shape + staleTime
- `test('enabled: true when ...')` — positive enabled guard
- `test('enabled: false when ...')` — negative enabled guard

Note: The existing test file uses `it()` throughout. The convention in the
plan uses `test()`. Both are valid in vitest; normalizing to `test()` is
cosmetic.

---

## The `mockReadonlyToken` Helper

The existing test file defines:

```ts
function mockReadonlyToken(
  address: Address,
): Parameters<typeof confidentialBalanceQueryOptions>[0] {
  return { address } as unknown as Parameters<typeof confidentialBalanceQueryOptions>[0];
}
```

This casts a minimal `{ address }` object as a `ReadonlyToken`. It works
because the options factories only use `token.address` for key generation —
`token.decryptBalance` is only called inside `queryFn`, which is not invoked
in pure options tests.

---

## Imports Used in Test File

```ts
import { describe, expect, it } from "vitest";
import type { Address } from "@zama-fhe/sdk";
import { ZamaSDK } from "@zama-fhe/sdk";
import {
  batchTransferFeeQueryOptions,
  confidentialBalanceQueryOptions,
  confidentialBalancesQueryOptions,
  confidentialIsApprovedQueryOptions,
  feeRecipientQueryOptions,
  isConfidentialQueryOptions,
  isWrapperQueryOptions,
  publicKeyQueryOptions,
  publicParamsQueryOptions,
  shieldFeeQueryOptions,
  tokenMetadataQueryOptions,
  totalSupplyQueryOptions,
  underlyingAllowanceQueryOptions,
  unshieldFeeQueryOptions,
  wrapperDiscoveryQueryOptions,
  zamaQueryKeys,
} from "@zama-fhe/sdk/query";
import { createMockSigner, createMockRelayer, createMockStorage } from "./test-utils";
```

---

## Gap Analysis

The ticket description says to add tests that "don't exist yet," but the
current file shows they largely **already exist**. The real tasks are:

### 1. Missing key-shape tests for `confidentialBalanceQueryOptions`
Add inside the existing `describe("confidentialBalanceQueryOptions")` block:
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

### 2. Missing key-shape tests for `confidentialBalancesQueryOptions`
Add inside the existing `describe("confidentialBalancesQueryOptions")` block:
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

### 3. Rename `it()` → `test()` throughout (optional cosmetic, per Rule 7)

---

## File Tree

```
packages/
  react-sdk/src/__tests__/
    query-options.test.ts       ← TARGET FILE (rewrite)
    test-utils.tsx              ← helper: createMockSigner, etc.
  sdk/src/query/
    confidential-balance.ts     ← enabled logic source
    confidential-balances.ts    ← enabled logic source
    wrapper-discovery.ts        ← enabled logic source
    query-keys.ts               ← key shape source
    factory-types.ts            ← QueryFactoryOptions type
    index.ts                    ← exports
TEST_UPDATE_PLAN.md             ← RFC / rules reference
```
