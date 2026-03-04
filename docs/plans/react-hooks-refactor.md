# Implementation Plan: React Hooks Refactor to Thin Wrappers + Full Cutover

**Unit:** `react-hooks-refactor`
**Date:** 2026-03-02
**Complexity:** Large (but all code work is complete — only docs + verification remain)
**RFC:** `TASK_1.md` (§Steps 6–9, §Layer 3/4, §Breaking changes policy)

---

## Work Assessment

**Type:** Mechanical refactoring with breaking public API surface changes.

The refactoring:

- Removed inline factory definitions from react-sdk hooks → imported from `@zama-fhe/sdk/query`
- Changed query key shapes (flat arrays → namespaced 2-tuples) — breaking for consumers who match keys
- Changed factory function signatures (token → signer+address for decoupled factories) — breaking
- Deleted `balance-query-keys.ts` and removed old named exports from `index.ts`
- Replaced inline `onSuccess` invalidation with centralized helpers

**All code changes are COMPLETE and VERIFIED.** The remaining work is:

1. Create a standalone `MIGRATION.md` with comprehensive before/after examples
2. Re-verify the full monorepo (build, typecheck, tests) as a final gate

---

## TDD Assessment

**TDD does NOT apply.** Justification:

1. This is mechanical refactoring — moving factory definitions from react-sdk into sdk/query
2. The `@zama-fhe/sdk/query` factories are already fully tested (33 test files in `packages/sdk/src/query/__tests__/`)
3. Hook behavior (data flow, optimistic updates, invalidation patterns) remains identical
4. The TypeScript compiler enforces type-correct wiring to the new factories
5. Existing react-sdk tests serve as regression guards (already updated and passing)
6. The remaining work is pure documentation (MIGRATION.md)

**Verification strategy:** `pnpm typecheck` → `pnpm test:run` → `pnpm build` for the full monorepo.

---

## Implementation Status — Completed Work

✓ VERIFIED by reading every hook file, test file, and index.ts:

| Category                                  | Status  | Evidence                                                                                                                                                                                                                                                                 |
| ----------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All 15 query factories in `sdk/query`     | ✅ Done | token-metadata, is-confidential, total-supply, wrapper-discovery, underlying-allowance, confidential-is-approved, fees, public-key, public-params, confidential-handle, confidential-balance, confidential-handles, confidential-balances, activity-feed, signer-address |
| All 14 mutation factories in `sdk/query`  | ✅ Done | shield, shield-eth, transfer, transfer-from, approve, approve-underlying, unshield, unshield-all, resume-unshield, unwrap, unwrap-all, finalize-unwrap, encrypt, authorize-all                                                                                           |
| 33 sdk/query test files                   | ✅ Done | `packages/sdk/src/query/__tests__/`                                                                                                                                                                                                                                      |
| SDK package.json `./query` subpath export | ✅ Done | types + import configured                                                                                                                                                                                                                                                |
| SDK tsup.config.ts `query/index` entry    | ✅ Done |                                                                                                                                                                                                                                                                          |
| SDK api-extractor.query.json + api report | ✅ Done | `etc/sdk-query.api.md`                                                                                                                                                                                                                                                   |
| All react-sdk query hooks (13 files)      | ✅ Done | All import from `@zama-fhe/sdk/query`, use `queryKeyHashFn: hashFn`                                                                                                                                                                                                      |
| All react-sdk mutation hooks (14 files)   | ✅ Done | All import from `@zama-fhe/sdk/query`, use centralized invalidation helpers                                                                                                                                                                                              |
| `balance-query-keys.ts` deleted           | ✅ Done | File gone, zero grep matches in `packages/react-sdk/src/`                                                                                                                                                                                                                |
| `index.ts` re-exports from sdk/query      | ✅ Done | zamaQueryKeys, hashFn, filterQueryOptions, all factories, all params types, all invalidation helpers                                                                                                                                                                     |
| `index.ts` old exports removed            | ✅ Done | No `confidentialBalanceQueryKeys`, `confidentialHandleQueryKeys`, `confidentialHandlesQueryKeys`, `confidentialBalancesQueryKeys`                                                                                                                                        |
| `useConfidentialBalance` two-phase        | ✅ Done | Composes `signerAddressQueryOptions` → `confidentialHandleQueryOptions` → `confidentialBalanceQueryOptions`                                                                                                                                                              |
| `useConfidentialBalances` batch variant   | ✅ Done | Composes `signerAddressQueryOptions` → `confidentialHandlesQueryOptions` → `confidentialBalancesQueryOptions`                                                                                                                                                            |
| `useActivityFeed` with logsKey            | ✅ Done | Computes `logsKey` from logs, passes to `activityFeedQueryOptions` from sdk/query                                                                                                                                                                                        |
| Optimistic balance helpers                | ✅ Done | `optimistic-balance-update.ts` uses `zamaQueryKeys.confidentialBalance.token()`                                                                                                                                                                                          |
| All test files updated                    | ✅ Done | query-options.test.ts, mutation-options.test.ts, mutation-hooks.test.tsx, query-hooks.test.tsx, token-hooks-extended.test.tsx, mutation-error-handling.test.ts                                                                                                           |
| `balance-query-keys.test.ts` deleted      | ✅ Done | Not in test directory                                                                                                                                                                                                                                                    |
| Changeset                                 | ✅ Done | `.changeset/react-hooks-refactor.md` with `major` bump                                                                                                                                                                                                                   |
| Build verified                            | ✅ Pass | `pnpm build` exit code 0                                                                                                                                                                                                                                                 |
| Typecheck verified                        | ✅ Pass | `pnpm typecheck` exit code 0                                                                                                                                                                                                                                             |
| Tests verified                            | ✅ Pass | `pnpm test:run` — 75 files, 823 tests                                                                                                                                                                                                                                    |

---

## Remaining Steps

### Step 1: Create `MIGRATION.md` (AC #12)

**File:** `docs/MIGRATION.md`

The changeset (`.changeset/react-hooks-refactor.md`) has brief migration notes, but the acceptance criteria require a standalone migration document with comprehensive before/after examples.

The `MIGRATION.md` must cover these breaking changes:

#### 1.1 Import Path Changes

```ts
// BEFORE — factories imported from react-sdk (inline definitions)
import { shieldMutationOptions } from "@zama-fhe/react-sdk";

// AFTER — factories from sdk/query (canonical source)
import { shieldMutationOptions } from "@zama-fhe/sdk/query";
// OR re-exported via react-sdk:
import { shieldMutationOptions } from "@zama-fhe/react-sdk";
```

#### 1.2 Per-Domain Key Factories → `zamaQueryKeys`

```ts
// BEFORE
import { confidentialBalanceQueryKeys } from "@zama-fhe/react-sdk";
confidentialBalanceQueryKeys.token(tokenAddress);
confidentialBalanceQueryKeys.owner(tokenAddress, owner);

// AFTER
import { zamaQueryKeys } from "@zama-fhe/react-sdk";
zamaQueryKeys.confidentialBalance.token(tokenAddress);
zamaQueryKeys.confidentialBalance.owner(tokenAddress, owner);
```

#### 1.3 Query Key Shape Changes (Full Table)

| Domain                 | Old Shape                                           | New Shape                                                                |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| confidentialBalance    | `["confidentialBalance", tokenAddr, owner, handle]` | `["zama.confidentialBalance", { tokenAddress, owner, handle? }]`         |
| confidentialHandle     | `["confidentialHandle", tokenAddr, owner]`          | `["zama.confidentialHandle", { tokenAddress, owner }]`                   |
| confidentialHandles    | `["confidentialHandles", tokenAddrs, owner]`        | `["zama.confidentialHandles", { tokenAddresses, owner }]`                |
| confidentialBalances   | `["confidentialBalances", tokenAddrs, owner]`       | `["zama.confidentialBalances", { tokenAddresses, owner }]`               |
| tokenMetadata          | `["tokenMetadata", tokenAddr]`                      | `["zama.tokenMetadata", { tokenAddress }]`                               |
| isConfidential         | `["isConfidential", tokenAddr]`                     | `["zama.isConfidential", { tokenAddress }]`                              |
| isWrapper              | `["isWrapper", tokenAddr]`                          | `["zama.isWrapper", { tokenAddress }]`                                   |
| totalSupply            | `["totalSupply", tokenAddr]`                        | `["zama.totalSupply", { tokenAddress }]`                                 |
| wrapperDiscovery       | `["wrapperDiscovery", tokenAddr, coordinatorAddr]`  | `["zama.wrapperDiscovery", { tokenAddress }]`                            |
| underlyingAllowance    | `["underlyingAllowance", tokenAddr, wrapperAddr]`   | `["zama.underlyingAllowance", { tokenAddress }]`                         |
| confidentialIsApproved | `["confidentialIsApproved", tokenAddr, spender]`    | `["zama.confidentialIsApproved", { tokenAddress }]`                      |
| fees (shield)          | `["shieldFee", feeManagerAddr, amount, from, to]`   | `["zama.fees", { type: "shield", feeManagerAddress, ... }]`              |
| fees (unshield)        | `["unshieldFee", feeManagerAddr, amount, from, to]` | `["zama.fees", { type: "unshield", feeManagerAddress, ... }]`            |
| fees (batchTransfer)   | `["batchTransferFee", feeManagerAddr]`              | `["zama.fees", { type: "batchTransfer", feeManagerAddress }]`            |
| fees (feeRecipient)    | `["feeRecipient", feeManagerAddr]`                  | `["zama.fees", { type: "feeRecipient", feeManagerAddress }]`             |
| publicKey              | `["publicKey"]`                                     | `["zama.publicKey"]`                                                     |
| publicParams           | `["publicParams", bits]`                            | `["zama.publicParams", { bits }]`                                        |
| activityFeed           | `["activityFeed", tokenAddr, userAddr, logsKey]`    | `["zama.activityFeed", { tokenAddress, userAddress, logsKey, decrypt }]` |
| signerAddress          | `["zama", "signer-address", tokenAddr]`             | `["zama.signerAddress", { tokenAddress }]`                               |

> **Note:** Mutation keys remain flat (NOT namespaced): `["shield", tokenAddr]`, `["confidentialTransfer", tokenAddr]`, etc.

#### 1.4 `authorizeAll` Mutation Variables

```ts
// BEFORE
const auth = useAuthorizeAll();
auth.mutate(["0xToken1", "0xToken2"]); // Address[]

// AFTER
auth.mutate({ tokenAddresses: ["0xToken1", "0xToken2"] }); // { tokenAddresses: Address[] }
```

#### 1.5 Removed Exports

- `confidentialBalanceQueryKeys` — use `zamaQueryKeys.confidentialBalance`
- `confidentialHandleQueryKeys` — use `zamaQueryKeys.confidentialHandle`
- `confidentialHandlesQueryKeys` — use `zamaQueryKeys.confidentialHandles`
- `confidentialBalancesQueryKeys` — use `zamaQueryKeys.confidentialBalances`
- `wagmiBalancePredicates` — use `invalidateWagmiBalanceQueries(queryClient)`
- `feeQueryKeys` — use `zamaQueryKeys.fees.*`

#### 1.6 `hashFn` Requirement

All `useQuery`/`useSuspenseQuery` calls now require `queryKeyHashFn: hashFn` because keys contain non-serializable objects. If constructing queries manually from the factory options, always include:

```ts
useQuery({
  ...tokenMetadataQueryOptions(signer, tokenAddress),
  queryKeyHashFn: hashFn, // REQUIRED
});
```

#### 1.7 Factory Signature Changes (Decoupled Factories)

```ts
// BEFORE (react-sdk inline) — took a Token instance
tokenMetadataQueryOptions(token: ReadonlyToken)

// AFTER (sdk/query) — takes signer + address for framework-agnostic use
tokenMetadataQueryOptions(signer: GenericSigner, tokenAddress: Address, config?)
```

Same pattern for: `isConfidentialQueryOptions`, `isWrapperQueryOptions`, `totalSupplyQueryOptions`, `wrapperDiscoveryQueryOptions`, `underlyingAllowanceQueryOptions`, `confidentialIsApprovedQueryOptions`, all fee factories.

Token-coupled factories (balance, activity, mutations) still take `token` as first arg.

### Step 2: Re-Verify Full Monorepo (Final Gate)

Even though verification passed previously, re-run as a gate before closing the unit:

```bash
pnpm typecheck          # AC #2: zero errors
pnpm test:run           # AC #3, #13: all tests pass
pnpm build              # AC #1: build succeeds
```

### Step 3: Final Acceptance Criteria Spot-Checks

```bash
# AC #4: balance-query-keys.ts deleted, no references
rg "balance-query-keys" packages/react-sdk/src/ --type ts --type tsx

# AC #5: every hook imports from sdk/query
rg "from.*@zama-fhe/sdk/query" packages/react-sdk/src/token/use-*.ts packages/react-sdk/src/relayer/use-*.ts | wc -l
# Should be >= 26 (one import per hook file)

# AC #10: no old key exports in index.ts
rg "confidentialBalanceQueryKeys|confidentialHandleQueryKeys|confidentialHandlesQueryKeys|confidentialBalancesQueryKeys" packages/react-sdk/src/index.ts

# AC #11: changeset exists
cat .changeset/react-hooks-refactor.md
```

---

## Files to Create

| File                | Purpose                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `docs/MIGRATION.md` | Standalone migration guide with all breaking changes, before/after examples, and key shape tables |

## Files to Modify

None — all code modifications are complete.

## Files Deleted (Already Done)

| File                                                          | Status                      |
| ------------------------------------------------------------- | --------------------------- |
| `packages/react-sdk/src/token/balance-query-keys.ts`          | ✅ Deleted                  |
| `packages/react-sdk/src/__tests__/balance-query-keys.test.ts` | ✅ Never existed separately |

---

## Acceptance Criteria Verification Matrix

| AC# | Criterion                                              | Status                   | How to Verify                        |
| --- | ------------------------------------------------------ | ------------------------ | ------------------------------------ |
| 1   | `pnpm build` succeeds for react-sdk                    | ✅ Verified (2026-03-02) | Re-run in Step 2                     |
| 2   | `pnpm typecheck` passes with zero errors               | ✅ Verified (2026-03-02) | Re-run in Step 2                     |
| 3   | All react-sdk tests pass                               | ✅ Verified (2026-03-02) | Re-run in Step 2                     |
| 4   | `balance-query-keys.ts` deleted, no references         | ✅ Verified              | grep returns 0 matches               |
| 5   | Every hook imports from sdk/query, no inline factories | ✅ Verified              | Read all 26 hook files               |
| 6   | `useConfidentialBalance` two-phase composition         | ✅ Verified              | signerAddress → handle → balance     |
| 7   | All `useQuery` calls pass `queryKeyHashFn: hashFn`     | ✅ Verified              | All hooks include hashFn             |
| 8   | Mutation `onSuccess` uses centralized helpers          | ✅ Verified              | invalidateAfterShield, etc.          |
| 9   | `index.ts` re-exports zamaQueryKeys, hashFn, etc.      | ✅ Verified              | Lines 226-280                        |
| 10  | `index.ts` no longer exports old \*QueryKeys           | ✅ Verified              | No old key exports present           |
| 11  | Changeset with BREAKING CHANGE                         | ✅ Verified              | `.changeset/react-hooks-refactor.md` |
| 12  | Migration docs with before/after examples              | ⬜ TODO                  | Create `docs/MIGRATION.md` (Step 1)  |
| 13  | Full monorepo tests pass                               | ✅ Verified (2026-03-02) | Re-run in Step 2                     |

---

## Risks and Mitigations

| Risk                                                                   | Impact               | Mitigation                                                    |
| ---------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------- |
| Typecheck/tests may have regressed since last verification             | Blocks AC 1-3, 13    | Re-run all three in Step 2 before closing                     |
| `MIGRATION.md` content may not match actual current API                | Misleads consumers   | Cross-reference with changeset, research doc, and actual code |
| Legacy `*QueryKeys` aliases still in hook files (not exported)         | None (internal only) | Documented as follow-up cleanup; not in public API            |
| `authorizeAll` breaking variable shape                                 | Consumer type errors | Documented in changeset + MIGRATION.md                        |
| Key shape changes break consumer `queryClient.invalidateQueries` calls | Silent cache misses  | Full table of old→new shapes in MIGRATION.md                  |
