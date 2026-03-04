# Implementation Plan: `@zama-fhe/sdk/query` Subpath

**Unit:** `sdk-query-subpath`
**Date:** 2026-03-02
**Complexity:** Large (but 100% implemented)
**RFC:** `TASK_1.md` (Steps 1–5)

---

## Work Assessment

**Type:** New feature / new public API surface — fully implemented in prior sessions.
**TDD does not apply** — all code, tests, configuration, and API reports already exist and pass. This plan documents the verification-only steps remaining.

**Justification:** The implementation is complete. 34 source files, 32 test files, package config, tsup entry, and api-extractor report all exist. Build succeeds, typecheck passes with zero errors, and all 823 tests pass (including all 32 query-specific test files). No new code needs to be written.

---

## Current State: ✓ COMPLETE

| Check                           | Result   | Detail                                                           |
| ------------------------------- | -------- | ---------------------------------------------------------------- |
| Source files in `src/query/`    | 34 files | All factories, utilities, types, barrel                          |
| Test files in `__tests__/`      | 32 files | All passing (+ test-helpers.ts)                                  |
| `pnpm build`                    | ✓        | `dist/query/index.js` (23 KB) + `dist/query/index.d.ts` (20 KB)  |
| `pnpm typecheck`                | ✓        | Zero errors                                                      |
| `pnpm test:run`                 | ✓        | 823 tests, 75 files, 0 failures                                  |
| `./query` subpath export        | ✓        | `package.json` exports `./query`                                 |
| `@tanstack/query-core` peer dep | ✓        | Optional, `>=5`                                                  |
| tsup entry                      | ✓        | `"query/index": "src/query/index.ts"`                            |
| api-extractor config            | ✓        | `api-extractor.query.json`                                       |
| API report                      | ✓        | `etc/sdk-query.api.md` (21 KB)                                   |
| Root scripts                    | ✓        | `api-report:sdk` and `api-report:check:sdk` include query config |

---

## Architecture Overview

### Three-Layer TanStack Query Architecture

```
Layer 3:  React hooks (useTokenMetadata, useShield, ...)        → react-sdk
Layer 2:  Query/Mutation options factories                       → sdk/query  ← THIS UNIT
Layer 1:  Core actions (Token, ReadonlyToken, contracts)         → sdk
```

### Factory Tier Classification

| Tier              | Closure                               | Key Identity                                           | Examples                                                                                  |
| ----------------- | ------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **Decoupled**     | `GenericSigner` (infrastructure only) | `signer.readContract(…)` via key params                | tokenMetadata, isConfidential, totalSupply, confidentialHandle, confidentialHandles, fees |
| **Token-coupled** | `ReadonlyToken` / `Token` instance    | `token.address` in key; closure provides decrypt/write | confidentialBalance, confidentialBalances, activityFeed, all mutations                    |
| **SDK-coupled**   | `ZamaSDK` instance                    | `sdk.relayer` methods                                  | publicKey, publicParams, encrypt, authorizeAll                                            |

### Critical Pattern: `queryFn` Param-Sourcing

**Decoupled factories** extract data params from `context.queryKey` (NOT closure):

```ts
queryFn: async (context) => {
  const [, { tokenAddress: keyAddr }] = context.queryKey;
  return signer.readContract(someContract(keyAddr)); // from KEY, not closure
};
```

**Token-coupled factories** close over `token` (not serializable):

```ts
queryFn: async (context) => {
  const [, { handle }] = context.queryKey;
  return token.decryptBalance(handle); // token from CLOSURE
};
```

### Critical Pattern: Spread Order

```ts
return {
  queryKey, // factory always wins
  queryFn, // factory always wins
  staleTime, // factory always wins
  enabled, // factory always wins (gates on required params)
  ...filterQueryOptions(config?.query ?? {}), // only non-behavioral domain params survive
};
```

---

## Complete File Inventory

### Source Files (34 in `packages/sdk/src/query/`)

#### Infrastructure (5 files)

| File               | Exports                                                         | Purpose                                           |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| `utils.ts`         | `filterQueryOptions`, `hashFn`                                  | Strip behavioral options; stable bigint-safe hash |
| `query-keys.ts`    | `zamaQueryKeys`                                                 | 17-domain key namespace with `zama.*` prefix      |
| `factory-types.ts` | `QueryFactoryOptions`, `MutationFactoryOptions`, `QueryContext` | Shared type contracts                             |
| `invalidation.ts`  | 5 invalidation helpers                                          | Centralized cache invalidation                    |
| `index.ts`         | Barrel re-exports                                               | Public API surface for `@zama-fhe/sdk/query`      |

#### Query Options Factories (15 files)

| File                          | Factory                                               | Tier          | staleTime               | Enabled Gate                          |
| ----------------------------- | ----------------------------------------------------- | ------------- | ----------------------- | ------------------------------------- |
| `signer-address.ts`           | `signerAddressQueryOptions`                           | Decoupled     | 30_000                  | always                                |
| `token-metadata.ts`           | `tokenMetadataQueryOptions`                           | Decoupled     | Infinity                | always                                |
| `is-confidential.ts`          | `isConfidentialQueryOptions`, `isWrapperQueryOptions` | Decoupled     | Infinity                | always                                |
| `total-supply.ts`             | `totalSupplyQueryOptions`                             | Decoupled     | 30_000                  | always                                |
| `wrapper-discovery.ts`        | `wrapperDiscoveryQueryOptions`                        | Decoupled     | Infinity                | always                                |
| `underlying-allowance.ts`     | `underlyingAllowanceQueryOptions`                     | Decoupled     | 30_000                  | always                                |
| `confidential-is-approved.ts` | `confidentialIsApprovedQueryOptions`                  | Decoupled     | 30_000                  | always                                |
| `fees.ts`                     | 4 fee factories                                       | Decoupled     | 30_000                  | always                                |
| `public-key.ts`               | `publicKeyQueryOptions`                               | SDK-coupled   | Infinity                | always                                |
| `public-params.ts`            | `publicParamsQueryOptions`                            | SDK-coupled   | Infinity                | always                                |
| `confidential-handle.ts`      | `confidentialHandleQueryOptions`                      | Decoupled     | refetchInterval: 10_000 | `owner` required                      |
| `confidential-balance.ts`     | `confidentialBalanceQueryOptions`                     | Token-coupled | Infinity                | `owner` + `handle`                    |
| `confidential-handles.ts`     | `confidentialHandlesQueryOptions`                     | Decoupled     | refetchInterval: 10_000 | `owner` + `tokenAddresses.length > 0` |
| `confidential-balances.ts`    | `confidentialBalancesQueryOptions`                    | Token-coupled | Infinity                | `owner` + `tokens.length > 0`         |
| `activity-feed.ts`            | `activityFeedQueryOptions`                            | Token-coupled | Infinity                | `userAddress` + `logs`                |

#### Mutation Options Factories (14 files)

| File                    | Factory                                   | Closes Over | mutationKey                                   |
| ----------------------- | ----------------------------------------- | ----------- | --------------------------------------------- |
| `shield.ts`             | `shieldMutationOptions`                   | Token       | `['shield', token.address]`                   |
| `shield-eth.ts`         | `shieldETHMutationOptions`                | Token       | `['shieldETH', token.address]`                |
| `transfer.ts`           | `confidentialTransferMutationOptions`     | Token       | `['confidentialTransfer', token.address]`     |
| `transfer-from.ts`      | `confidentialTransferFromMutationOptions` | Token       | `['confidentialTransferFrom', token.address]` |
| `approve.ts`            | `confidentialApproveMutationOptions`      | Token       | `['confidentialApprove', token.address]`      |
| `approve-underlying.ts` | `approveUnderlyingMutationOptions`        | Token       | `['approveUnderlying', token.address]`        |
| `unshield.ts`           | `unshieldMutationOptions`                 | Token       | `['unshield', token.address]`                 |
| `unshield-all.ts`       | `unshieldAllMutationOptions`              | Token       | `['unshieldAll', token.address]`              |
| `resume-unshield.ts`    | `resumeUnshieldMutationOptions`           | Token       | `['resumeUnshield', token.address]`           |
| `unwrap.ts`             | `unwrapMutationOptions`                   | Token       | `['unwrap', token.address]`                   |
| `unwrap-all.ts`         | `unwrapAllMutationOptions`                | Token       | `['unwrapAll', token.address]`                |
| `finalize-unwrap.ts`    | `finalizeUnwrapMutationOptions`           | Token       | `['finalizeUnwrap', token.address]`           |
| `encrypt.ts`            | `encryptMutationOptions`                  | ZamaSDK     | `['encrypt']`                                 |
| `authorize-all.ts`      | `authorizeAllMutationOptions`             | ZamaSDK     | `['authorizeAll']`                            |

### Test Files (32 in `__tests__/` + `test-helpers.ts`)

All test files exist and pass:

```
utils.test.ts, query-keys.test.ts, invalidation.test.ts, signer-address.test.ts,
token-metadata.test.ts, is-confidential.test.ts, total-supply.test.ts,
wrapper-discovery.test.ts, underlying-allowance.test.ts, confidential-is-approved.test.ts,
fees.test.ts, public-key.test.ts, public-params.test.ts,
confidential-handle.test.ts, confidential-balance.test.ts,
confidential-handles.test.ts, confidential-balances.test.ts,
activity-feed.test.ts,
shield.test.ts, shield-eth.test.ts, transfer.test.ts, transfer-from.test.ts,
approve.test.ts, approve-underlying.test.ts, unshield.test.ts, unshield-all.test.ts,
resume-unshield.test.ts, unwrap.test.ts, unwrap-all.test.ts, finalize-unwrap.test.ts,
encrypt.test.ts, authorize-all.test.ts
```

---

## Implementation Steps (Verification Only)

Since ALL code is already written and passing, the only steps are:

### Step 1: Verify build output

```bash
pnpm --filter @zama-fhe/sdk build
ls packages/sdk/dist/query/index.js packages/sdk/dist/query/index.d.ts
```

**Result:** ✓ Both files emitted (23 KB JS, 20 KB DTS)

### Step 2: Verify typecheck

```bash
pnpm --filter @zama-fhe/sdk typecheck
```

**Result:** ✓ Zero errors

### Step 3: Run all query tests

```bash
pnpm test:run -- packages/sdk/src/query/
```

**Result:** ✓ 823 tests pass across 75 files (includes query + dependent react-sdk tests)

### Step 4: Verify API report

```bash
pnpm api-report:sdk
ls packages/sdk/etc/sdk-query.api.md
```

**Result:** ✓ Report exists (21 KB), includes all public exports

---

## Acceptance Criteria Verification Matrix

| #   | Criterion                                                       | Verified By                                                                      | Status |
| --- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| 1   | Import resolves in TypeScript                                   | `pnpm typecheck` zero errors                                                     | ✓      |
| 2   | `pnpm build` succeeds, dist/query emitted                       | Build output + ls                                                                | ✓      |
| 3   | `pnpm typecheck` zero errors                                    | tsc --noEmit                                                                     | ✓      |
| 4   | All 29+ test files pass                                         | 823 tests, 0 failures                                                            | ✓      |
| 5   | Every `zamaQueryKeys` entry starts with `zama.`                 | `query-keys.test.ts` prefix assertions (23 tests)                                | ✓      |
| 6   | Parameterized keys are 2-element tuples                         | `query-keys.test.ts` shape assertions                                            | ✓      |
| 7   | `filterQueryOptions` strips correct keys                        | `utils.test.ts` (7 tests)                                                        | ✓      |
| 8   | `hashFn` handles bigint + deterministic ordering                | `utils.test.ts`                                                                  | ✓      |
| 9   | All query factories return queryKey, queryFn, enabled           | All 15 factory test files                                                        | ✓      |
| 10  | Decoupled factories extract from `context.queryKey`             | Alt-key tests in token-metadata, confidential-handle, confidential-handles, etc. | ✓      |
| 11  | `confidentialHandle` refetchInterval 10000, overrideable        | `confidential-handle.test.ts`                                                    | ✓      |
| 12  | `confidentialBalance` staleTime Infinity, key changes on handle | `confidential-balance.test.ts`                                                   | ✓      |
| 13  | All mutation factories return mutationKey + mutationFn          | 14 mutation test files                                                           | ✓      |
| 14  | `invalidateAfterShield` calls correct invalidations             | `invalidation.test.ts`                                                           | ✓      |
| 15  | `invalidateWagmiBalanceQueries` predicate correct               | `invalidation.test.ts`                                                           | ✓      |
| 16  | API report generated                                            | `etc/sdk-query.api.md` exists (21 KB)                                            | ✓      |

**All 16 acceptance criteria are GREEN.**

---

## Risks

No implementation risks — the unit is complete. The only risk is the api-extractor `ae-forgotten-export` warnings for internal types (`ReadonlyToken`, `Token`, `ActivityFeedConfig`, etc.) not re-exported from the `query` subpath. These are expected: the `query` subpath intentionally does NOT re-export core SDK types (consumers get those from `@zama-fhe/sdk`).

---

## Notes on Implementation Decisions

1. **`confidentialHandles` is Decoupled** (takes `GenericSigner`), not Token-coupled. It only calls `signer.readContract` so Token class is unnecessary.
2. **`publicKey`/`publicParams`/`encrypt`/`authorizeAll` take `ZamaSDK`** (not `RelayerSDK` directly) for API simplicity.
3. **`factory-types.ts`** is an extra file beyond RFC spec providing shared type interfaces.
4. **`activityFeed` queryFn** closes over `config.logs` (too large for queryKey). The `logsKey` in queryKey is a cache fingerprint only.
5. **Spread order:** `filterQueryOptions` result is spread LAST (not first), but since it strips all behavioral keys, the effect is the same as the RFC diagram.
6. **`decryption` namespace** added to `zamaQueryKeys` beyond RFC spec for future use.
