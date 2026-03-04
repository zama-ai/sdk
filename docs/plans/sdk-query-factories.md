# Plan: SDK Query Factories — normalizeHandle, spread order, coordinator key

## Work Type Assessment

**TDD applies.** All three issues change observable behavior:

1. **ISSUE-002** (bug fix): `confidential-handle.ts` / `confidential-handles.ts` return raw `bigint` from `readContract` instead of normalized hex strings. This is a data correctness bug — consumers receive wrong types.
2. **ISSUE-004** (behavioral fix): Spread order inversion means the factory return shape doesn't match the wagmi contract. While `filterQueryOptions` strips most critical keys, the ordering contract matters for semantic correctness and user-passed non-stripped options.
3. **ISSUE-005** (bug fix): `wrapperDiscovery` reads `coordinatorAddress` from closure instead of `context.queryKey`, violating the decoupled factory contract. Different coordinator addresses would share the same cache key.

All three warrant tests-first to lock down the expected behavior.

---

## Step-by-Step Implementation

### Phase 1: Write Tests (RED)

#### Step 1.1 — `normalizeHandle` unit tests in `utils.test.ts`

Add a `describe("normalizeHandle")` block to `packages/sdk/src/query/__tests__/utils.test.ts`:

```ts
import { normalizeHandle, ZERO_HANDLE } from "../utils";

describe("normalizeHandle", () => {
  test("converts bigint to 0x-prefixed 64-char hex string", () => {
    const result = normalizeHandle(42n);
    expect(result).toBe("0x000000000000000000000000000000000000000000000000000000000000002a");
  });

  test("passes through valid 0x-prefixed hex string unchanged", () => {
    const addr = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
    expect(normalizeHandle(addr)).toBe(addr);
  });

  test("returns ZERO_HANDLE for non-bigint non-hex input", () => {
    expect(normalizeHandle(null)).toBe(ZERO_HANDLE);
    expect(normalizeHandle(undefined)).toBe(ZERO_HANDLE);
    expect(normalizeHandle(42)).toBe(ZERO_HANDLE);
    expect(normalizeHandle("not-hex")).toBe(ZERO_HANDLE);
  });
});
```

**File:** `packages/sdk/src/query/__tests__/utils.test.ts` (modify)

#### Step 1.2 — `confidential-handle` normalizeHandle integration test

Add test to `packages/sdk/src/query/__tests__/confidential-handle.test.ts`:

```ts
test("normalizes bigint readContract result to hex string", async () => {
  const signer = createMockSigner();
  vi.mocked(signer.readContract).mockResolvedValueOnce(42n as any);

  const options = confidentialHandleQueryOptions(signer, "0xToken", { owner: "0xOwner" });
  const result = await options.queryFn({ queryKey: options.queryKey });

  expect(result).toBe("0x000000000000000000000000000000000000000000000000000000000000002a");
});
```

**File:** `packages/sdk/src/query/__tests__/confidential-handle.test.ts` (modify)

#### Step 1.3 — `confidential-handles` normalizeHandle integration test

Add test to `packages/sdk/src/query/__tests__/confidential-handles.test.ts`:

```ts
test("normalizes bigint readContract results to hex strings", async () => {
  const signer = createMockSigner();
  vi.mocked(signer.readContract)
    .mockResolvedValueOnce(1n as any)
    .mockResolvedValueOnce(2n as any);

  const options = confidentialHandlesQueryOptions(signer, ["0xA", "0xB"], { owner: "0xOwner" });
  const result = await options.queryFn({ queryKey: options.queryKey });

  expect(result).toEqual([
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    "0x0000000000000000000000000000000000000000000000000000000000000002",
  ]);
});
```

**File:** `packages/sdk/src/query/__tests__/confidential-handles.test.ts` (modify)

#### Step 1.4 — `wrapperDiscovery` query key alignment test

Add test to `packages/sdk/src/query/__tests__/wrapper-discovery.test.ts`:

```ts
test("query key includes coordinatorAddress", () => {
  const signer = createMockSigner();
  const options = wrapperDiscoveryQueryOptions(signer, "0xToken", {
    coordinatorAddress: "0xCoordinator",
  });

  expect(options.queryKey).toEqual([
    "zama.wrapperDiscovery",
    { tokenAddress: "0xToken", coordinatorAddress: "0xCoordinator" },
  ]);
});

test("queryFn reads coordinatorAddress from queryKey, not closure", async () => {
  const signer = createMockSigner();
  vi.mocked(signer.readContract).mockResolvedValueOnce(true).mockResolvedValueOnce("0xWrapper");

  const options = wrapperDiscoveryQueryOptions(signer, "0xToken", {
    coordinatorAddress: "0xCoordinator",
  });

  await options.queryFn({ queryKey: options.queryKey });

  // Both contract calls should use the coordinatorAddress from the key
  expect(signer.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      args: expect.arrayContaining(["0xCoordinator"]),
    }),
  );
});
```

**File:** `packages/sdk/src/query/__tests__/wrapper-discovery.test.ts` (modify)

#### Step 1.5 — Update `query-keys.test.ts` for new wrapperDiscovery signature

Update the existing `zamaQueryKeys.wrapperDiscovery.token("0xtoken")` call to include coordinatorAddress.

**File:** `packages/sdk/src/query/__tests__/query-keys.test.ts` (modify)

### Phase 2: Implementation (GREEN)

#### Step 2.1 — Add `normalizeHandle` and `ZERO_HANDLE` to `utils.ts`

Add to `packages/sdk/src/query/utils.ts`:

```ts
export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export function normalizeHandle(value: unknown): string {
  if (typeof value === "string" && value.startsWith("0x")) return value;
  if (typeof value === "bigint") return `0x${value.toString(16).padStart(64, "0")}`;
  return ZERO_HANDLE;
}
```

**File:** `packages/sdk/src/query/utils.ts` (modify)

#### Step 2.2 — Export `normalizeHandle` from `index.ts`

Update the existing export line:

```ts
export { filterQueryOptions, hashFn, normalizeHandle, ZERO_HANDLE } from "./utils";
```

**File:** `packages/sdk/src/query/index.ts` (modify)

#### Step 2.3 — Add `normalizeHandle` call in `confidential-handle.ts`

Wrap the `readContract` return with `normalizeHandle`:

```ts
import { normalizeHandle } from "./utils";

// In queryFn:
const raw = await signer.readContract<Address>(
  confidentialBalanceOfContract(keyTokenAddress as Address, keyOwner as Address),
);
return normalizeHandle(raw) as Address;
```

**File:** `packages/sdk/src/query/confidential-handle.ts` (modify)

#### Step 2.4 — Add `normalizeHandle` call in `confidential-handles.ts`

Wrap each mapped `readContract` result:

```ts
import { normalizeHandle } from "./utils";

// In queryFn:
return Promise.all(
  keyTokenAddresses.map(async (tokenAddress) => {
    const raw = await signer.readContract<Address>(
      confidentialBalanceOfContract(tokenAddress as Address, keyOwner as Address),
    );
    return normalizeHandle(raw) as Address;
  }),
);
```

**File:** `packages/sdk/src/query/confidential-handles.ts` (modify)

#### Step 2.5 — Update `query-keys.ts` wrapperDiscovery key

```ts
wrapperDiscovery: {
  all: ["zama.wrapperDiscovery"] as const,
  token: (tokenAddress: string, coordinatorAddress: string) =>
    ["zama.wrapperDiscovery", { tokenAddress, coordinatorAddress }] as const,
},
```

**File:** `packages/sdk/src/query/query-keys.ts` (modify)

#### Step 2.6 — Update `wrapper-discovery.ts` to use coordinator from key

```ts
const queryKey = zamaQueryKeys.wrapperDiscovery.token(tokenAddress, config.coordinatorAddress);

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

**File:** `packages/sdk/src/query/wrapper-discovery.ts` (modify)

#### Step 2.7 — Fix spread order in all 15 factory files (mechanical)

For each factory file, move `...filterQueryOptions(...)` from last position to first position in the return object literal. Pattern:

```ts
// BEFORE:
return {
  queryKey,
  queryFn: ...,
  enabled: ...,
  ...filterQueryOptions(config?.query ?? {}),
};

// AFTER:
return {
  ...filterQueryOptions(config?.query ?? {}),
  queryKey,
  queryFn: ...,
  enabled: ...,
};
```

**Files (15):**
- `packages/sdk/src/query/activity-feed.ts`
- `packages/sdk/src/query/confidential-balance.ts`
- `packages/sdk/src/query/confidential-balances.ts`
- `packages/sdk/src/query/confidential-handle.ts`
- `packages/sdk/src/query/confidential-handles.ts`
- `packages/sdk/src/query/confidential-is-approved.ts`
- `packages/sdk/src/query/fees.ts` (4 factory functions inside)
- `packages/sdk/src/query/is-confidential.ts`
- `packages/sdk/src/query/public-key.ts`
- `packages/sdk/src/query/public-params.ts`
- `packages/sdk/src/query/signer-address.ts`
- `packages/sdk/src/query/token-metadata.ts`
- `packages/sdk/src/query/total-supply.ts`
- `packages/sdk/src/query/underlying-allowance.ts`
- `packages/sdk/src/query/wrapper-discovery.ts`

### Phase 3: Verify (REFACTOR)

#### Step 3.1 — Run tests

```bash
pnpm run test
```

All new and existing tests must pass.

#### Step 3.2 — Run typecheck

```bash
pnpm run typecheck
```

Must pass. Key risk: changing `wrapperDiscovery.token()` signature from 1 param to 2 params may break callers. `invalidation.ts` uses `.all` variant only (verified — unaffected).

---

## Files Summary

### Files to Create

None.

### Files to Modify

| File | Changes |
|------|---------|
| `packages/sdk/src/query/utils.ts` | Add `ZERO_HANDLE` constant, add `normalizeHandle()` function |
| `packages/sdk/src/query/index.ts` | Export `normalizeHandle`, `ZERO_HANDLE` |
| `packages/sdk/src/query/query-keys.ts` | Add `coordinatorAddress` param to `wrapperDiscovery.token()` |
| `packages/sdk/src/query/confidential-handle.ts` | Import + call `normalizeHandle`, fix spread order |
| `packages/sdk/src/query/confidential-handles.ts` | Import + call `normalizeHandle`, fix spread order |
| `packages/sdk/src/query/wrapper-discovery.ts` | Pass coordinator to key, read from key in queryFn, fix spread order |
| `packages/sdk/src/query/activity-feed.ts` | Fix spread order |
| `packages/sdk/src/query/confidential-balance.ts` | Fix spread order |
| `packages/sdk/src/query/confidential-balances.ts` | Fix spread order |
| `packages/sdk/src/query/confidential-is-approved.ts` | Fix spread order |
| `packages/sdk/src/query/fees.ts` | Fix spread order (4 factories) |
| `packages/sdk/src/query/is-confidential.ts` | Fix spread order |
| `packages/sdk/src/query/public-key.ts` | Fix spread order |
| `packages/sdk/src/query/public-params.ts` | Fix spread order |
| `packages/sdk/src/query/signer-address.ts` | Fix spread order |
| `packages/sdk/src/query/token-metadata.ts` | Fix spread order |
| `packages/sdk/src/query/total-supply.ts` | Fix spread order |
| `packages/sdk/src/query/underlying-allowance.ts` | Fix spread order |
| `packages/sdk/src/query/__tests__/utils.test.ts` | Add `normalizeHandle` tests |
| `packages/sdk/src/query/__tests__/confidential-handle.test.ts` | Add normalizeHandle integration test |
| `packages/sdk/src/query/__tests__/confidential-handles.test.ts` | Add normalizeHandle integration test |
| `packages/sdk/src/query/__tests__/wrapper-discovery.test.ts` | Add coordinator key alignment tests |
| `packages/sdk/src/query/__tests__/query-keys.test.ts` | Update wrapperDiscovery.token() call signature |

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `wrapperDiscovery.token()` signature change breaks callers | Medium | Grep confirmed only 2 call sites: `wrapper-discovery.ts` and `query-keys.test.ts`. `invalidation.ts` uses `.all` only. |
| `normalizeHandle` return type vs `Address` | Low | Return `string` from utility; cast to `Address` at call sites in handle factories. |
| Spread order change subtly alters behavior | Low | `filterQueryOptions` strips all TanStack behavioral keys. Non-stripped domain keys from user's `query` object would spread first then be overridden by factory keys — correct behavior. |
| Existing test snapshots for query keys | Low | Only `query-keys.test.ts:128` references `wrapperDiscovery.token()` — update the call. |

---

## Acceptance Criteria Verification

| # | Criterion | Verified By |
|---|-----------|-------------|
| 1 | confidential-handle.ts calls normalizeHandle | Step 2.3 + test 1.2 |
| 2 | normalizeHandle exported from @zama-fhe/sdk | Step 2.2 (index.ts export) |
| 3 | All factories place filterQueryOptions spread first | Step 2.7 (mechanical, all 15 files) |
| 4 | wrapperDiscovery key includes coordinatorAddress | Step 2.5 + test 1.4 |
| 5 | wrapperDiscovery queryFn reads from queryKey | Step 2.6 + test 1.4 |
| 6 | normalizeHandle unit tests | Step 1.1 |
| 7 | wrapperDiscovery queryKey test | Step 1.4 |
| 8 | pnpm run typecheck passes | Step 3.2 |
| 9 | pnpm run test passes | Step 3.1 |
