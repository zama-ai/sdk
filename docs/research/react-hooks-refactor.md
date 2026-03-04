# Research: react-hooks-refactor

**Unit:** react-hooks-refactor
**Task:** Refactor React Hooks to Thin Wrappers + Full Cutover
**RFC:** TASK_1.md (§Steps 6–7, §Layer 3/4, §Breaking changes policy)
**Research Date:** 2026-03-02

---

## CURRENT STATE SUMMARY

> **Most of this unit is ALREADY COMPLETE.** A prior implementation pass completed Steps 1–8 of the RFC. The hooks are thin wrappers, `balance-query-keys.ts` is deleted, `index.ts` re-exports from `@zama-fhe/sdk/query`, all tests are updated, and a changeset exists.
>
> **Remaining: only `MIGRATION.md`** (item 9 of the unit description).

---

## 1. Implementation Status — Step-by-Step

### ✓ DONE: `packages/sdk/src/query/` — FULLY IMPLEMENTED

All query/mutation factories are present and working:

- `utils.ts` — `filterQueryOptions`, `hashFn`
- `query-keys.ts` — `zamaQueryKeys` with `zama.` namespace
- `invalidation.ts` — `invalidateBalanceQueries`, `invalidateAfterShield`, `invalidateAfterUnshield`, `invalidateAfterApprove`, `invalidateWagmiBalanceQueries`
- `index.ts` — barrel export for `@zama-fhe/sdk/query`
- `factory-types.ts` — `QueryFactoryOptions<TKey, TData>`, `MutationFactoryOptions<TKey, TVars, TData>`
- All 15 query factories: `token-metadata.ts`, `is-confidential.ts`, `total-supply.ts`, `wrapper-discovery.ts`, `underlying-allowance.ts`, `confidential-is-approved.ts`, `fees.ts`, `public-key.ts`, `public-params.ts`, `confidential-handle.ts`, `confidential-balance.ts`, `confidential-handles.ts`, `confidential-balances.ts`, `activity-feed.ts`, `signer-address.ts`
- All 14 mutation factories: `shield.ts`, `shield-eth.ts`, `transfer.ts`, `transfer-from.ts`, `approve.ts`, `approve-underlying.ts`, `unshield.ts`, `unshield-all.ts`, `resume-unshield.ts`, `unwrap.ts`, `unwrap-all.ts`, `finalize-unwrap.ts`, `encrypt.ts`, `authorize-all.ts`
- 33 test files in `packages/sdk/src/query/__tests__/`

### ✓ DONE: `packages/sdk/package.json` — Already configured

```json
"exports": {
  "./query": { "types": "./dist/query/index.d.ts", "import": "./dist/query/index.js" }
},
"peerDependencies": { "@tanstack/query-core": ">=5" },
"peerDependenciesMeta": { "@tanstack/query-core": { "optional": true } }
```

### ✓ DONE: `packages/sdk/tsup.config.ts` — `query/index` entry added

```ts
entry: {
  "query/index": "src/query/index.ts",
  // ... other entries
}
```

### ✓ DONE: `packages/sdk/api-extractor.query.json` — API extractor config exists

`packages/sdk/etc/sdk-query.api.md` report file is also present.

### ✓ DONE: Root `package.json` api-report scripts include `api-extractor.query.json`

Both `api-report:sdk` and `api-report:check:sdk` include `api-extractor run ... -c api-extractor.query.json`.

### ✓ DONE: All react-sdk hooks are thin wrappers (Step 6)

**Every** `packages/react-sdk/src/token/use-*.ts` and `packages/react-sdk/src/relayer/use-*.ts` hook already imports from `@zama-fhe/sdk/query`:

| Hook File                           | Factory Imported                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `use-token-metadata.ts`             | `tokenMetadataQueryOptions, hashFn, zamaQueryKeys`                                                                              |
| `use-is-confidential.ts`            | `isConfidentialQueryOptions, isWrapperQueryOptions, hashFn, zamaQueryKeys`                                                      |
| `use-total-supply.ts`               | `totalSupplyQueryOptions, hashFn, zamaQueryKeys`                                                                                |
| `use-wrapper-discovery.ts`          | `wrapperDiscoveryQueryOptions, hashFn, zamaQueryKeys`                                                                           |
| `use-underlying-allowance.ts`       | `underlyingAllowanceQueryOptions, signerAddressQueryOptions, hashFn, zamaQueryKeys`                                             |
| `use-confidential-is-approved.ts`   | `confidentialIsApprovedQueryOptions, signerAddressQueryOptions, hashFn, zamaQueryKeys`                                          |
| `use-fees.ts`                       | `shieldFeeQueryOptions, unshieldFeeQueryOptions, batchTransferFeeQueryOptions, feeRecipientQueryOptions, hashFn, zamaQueryKeys` |
| `use-public-key.ts`                 | `publicKeyQueryOptions, hashFn, zamaQueryKeys`                                                                                  |
| `use-public-params.ts`              | `publicParamsQueryOptions, hashFn, zamaQueryKeys`                                                                               |
| `use-confidential-balance.ts`       | `confidentialHandleQueryOptions, confidentialBalanceQueryOptions, signerAddressQueryOptions, hashFn`                            |
| `use-confidential-balances.ts`      | `confidentialHandlesQueryOptions, confidentialBalancesQueryOptions, signerAddressQueryOptions, hashFn`                          |
| `use-activity-feed.ts`              | `activityFeedQueryOptions, hashFn, zamaQueryKeys`                                                                               |
| `use-shield.ts`                     | `shieldMutationOptions, invalidateAfterShield` + optimistic helpers                                                             |
| `use-shield-eth.ts`                 | `shieldETHMutationOptions, invalidateAfterShield`                                                                               |
| `use-confidential-transfer.ts`      | `confidentialTransferMutationOptions, invalidateBalanceQueries`                                                                 |
| `use-confidential-transfer-from.ts` | `confidentialTransferFromMutationOptions, invalidateBalanceQueries`                                                             |
| `use-confidential-approve.ts`       | `confidentialApproveMutationOptions, invalidateAfterApprove`                                                                    |
| `use-approve-underlying.ts`         | `approveUnderlyingMutationOptions`                                                                                              |
| `use-unshield.ts`                   | `unshieldMutationOptions, invalidateAfterUnshield`                                                                              |
| `use-unshield-all.ts`               | `unshieldAllMutationOptions, invalidateAfterUnshield`                                                                           |
| `use-resume-unshield.ts`            | `resumeUnshieldMutationOptions, invalidateAfterUnshield`                                                                        |
| `use-unwrap.ts`                     | `unwrapMutationOptions`                                                                                                         |
| `use-unwrap-all.ts`                 | `unwrapAllMutationOptions`                                                                                                      |
| `use-finalize-unwrap.ts`            | `finalizeUnwrapMutationOptions, invalidateAfterUnshield`                                                                        |
| `use-authorize-all.ts`              | `authorizeAllMutationOptions`                                                                                                   |
| `use-encrypt.ts`                    | `encryptMutationOptions`                                                                                                        |

### ✓ DONE: `packages/react-sdk/src/token/balance-query-keys.ts` — DELETED (Step 5)

File does not exist in the filesystem.

### ✓ DONE: `packages/react-sdk/src/index.ts` — Updated (Step 6)

The index already has a large re-export block from `@zama-fhe/sdk/query`:

```ts
export {
  zamaQueryKeys,
  hashFn,
  filterQueryOptions,
  invalidateBalanceQueries,
  invalidateAfterShield,
  invalidateAfterUnshield,
  invalidateAfterApprove,
  invalidateWagmiBalanceQueries,
  signerAddressQueryOptions,
  tokenMetadataQueryOptions,
  type TokenMetadata,
  isConfidentialQueryOptions,
  isWrapperQueryOptions,
  totalSupplyQueryOptions,
  wrapperDiscoveryQueryOptions,
  underlyingAllowanceQueryOptions,
  confidentialIsApprovedQueryOptions,
  shieldFeeQueryOptions,
  unshieldFeeQueryOptions,
  batchTransferFeeQueryOptions,
  feeRecipientQueryOptions,
  publicKeyQueryOptions,
  publicParamsQueryOptions,
  confidentialHandleQueryOptions,
  confidentialBalanceQueryOptions,
  confidentialHandlesQueryOptions,
  confidentialBalancesQueryOptions,
  activityFeedQueryOptions,
  shieldMutationOptions,
  type ShieldParams,
  shieldETHMutationOptions,
  type ShieldETHParams,
  confidentialTransferMutationOptions,
  type ConfidentialTransferParams,
  confidentialTransferFromMutationOptions,
  type ConfidentialTransferFromParams,
  confidentialApproveMutationOptions,
  type ConfidentialApproveParams,
  approveUnderlyingMutationOptions,
  type ApproveUnderlyingParams,
  unshieldMutationOptions,
  type UnshieldParams,
  unshieldAllMutationOptions,
  type UnshieldAllParams,
  resumeUnshieldMutationOptions,
  type ResumeUnshieldParams,
  unwrapMutationOptions,
  type UnwrapParams,
  unwrapAllMutationOptions,
  finalizeUnwrapMutationOptions,
  type FinalizeUnwrapParams,
  encryptMutationOptions,
  authorizeAllMutationOptions,
  type AuthorizeAllParams,
} from "@zama-fhe/sdk/query";
```

### ✓ DONE: Test files updated (Step 7)

- `balance-query-keys.test.ts` — **DELETED** (not in test directory listing)
- `query-options.test.ts` — Imports from `@zama-fhe/sdk/query`, uses new factory sigs (`signer+address`), asserts new namespaced key shapes (e.g. `["zama.tokenMetadata", { tokenAddress }]`)
- `mutation-options.test.ts` — Imports from `@zama-fhe/sdk/query`, tests all mutation factories
- `mutation-hooks.test.tsx` — Uses `zamaQueryKeys.confidentialBalance.owner(TOKEN, "0xuser", "0xhandle")` (new namespaced key)
- `query-hooks.test.tsx` — No key shape assertions; tests behavioral correctness only

### ✓ DONE: Changeset entry (Step 8)

`.changeset/react-hooks-refactor.md` exists with `"@zama-fhe/react-sdk": major` and migration notes covering:

- Per-domain query key factories → `zamaQueryKeys`
- Flat key arrays → namespaced 2-tuple keys
- React-local factory imports → `@zama-fhe/sdk/query` imports
- `authorizeAll` mutation variables shape change

### ✗ TODO: MIGRATION.md (Step 9)

No dedicated `MIGRATION.md` file exists at the repo root or docs. The changeset has basic migration notes, but a standalone `MIGRATION.md` with comprehensive before/after examples is still needed.

---

## 2. Remaining Work

### Only Item: Create `MIGRATION.md`

The unit description says: "(9) Add a MIGRATION.md or migration section in the PR description covering all breaking changes with before/after examples."

The `MIGRATION.md` should cover:

1. **Import path migration** — all `*QueryOptions` / `*MutationOptions` now from `@zama-fhe/sdk/query`
2. **Per-domain key factories → `zamaQueryKeys`** — e.g. `confidentialBalanceQueryKeys.token(addr)` → `zamaQueryKeys.confidentialBalance.token(addr)`
3. **Query key shape migration** — flat → namespaced 2-tuple (complete table below)
4. **`authorizeAll` mutate variables** — `Address[]` → `{ tokenAddresses: Address[] }`
5. **`wagmiBalancePredicates` removed** — use `invalidateWagmiBalanceQueries(queryClient)` instead
6. **`feeQueryKeys` removed** — use `zamaQueryKeys.fees.*` instead

---

## 3. Key API Reference (for MIGRATION.md)

### Query Key Shape Changes (Breaking)

| Domain                 | Old key                                                 | New key                                                                       |
| ---------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| confidentialBalance    | `["confidentialBalance", tokenAddr, ownerAddr, handle]` | `["zama.confidentialBalance", { tokenAddress, owner, handle? }]`              |
| confidentialHandle     | `["confidentialHandle", tokenAddr, ownerAddr]`          | `["zama.confidentialHandle", { tokenAddress, owner }]`                        |
| confidentialHandles    | `["confidentialHandles", tokenAddrs, ownerAddr]`        | `["zama.confidentialHandles", { tokenAddresses, owner }]`                     |
| confidentialBalances   | `["confidentialBalances", tokenAddrs, ownerAddr]`       | `["zama.confidentialBalances", { tokenAddresses, owner }]`                    |
| tokenMetadata          | `["tokenMetadata", tokenAddr]`                          | `["zama.tokenMetadata", { tokenAddress }]`                                    |
| isConfidential         | `["isConfidential", tokenAddr]`                         | `["zama.isConfidential", { tokenAddress }]`                                   |
| isWrapper              | `["isWrapper", tokenAddr]`                              | `["zama.isWrapper", { tokenAddress }]`                                        |
| totalSupply            | `["totalSupply", tokenAddr]`                            | `["zama.totalSupply", { tokenAddress }]`                                      |
| wrapperDiscovery       | `["wrapperDiscovery", tokenAddr, coordinatorAddr]`      | `["zama.wrapperDiscovery", { tokenAddress }]`                                 |
| underlyingAllowance    | `["underlyingAllowance", tokenAddr, wrapperAddr]`       | `["zama.underlyingAllowance", { tokenAddress }]`                              |
| confidentialIsApproved | `["confidentialIsApproved", tokenAddr, spender]`        | `["zama.confidentialIsApproved", { tokenAddress }]`                           |
| fees (shield)          | `["shieldFee", feeManagerAddr, amount, from, to]`       | `["zama.fees", { type: "shield", feeManagerAddress, amount?, from?, to? }]`   |
| fees (unshield)        | `["unshieldFee", feeManagerAddr, amount, from, to]`     | `["zama.fees", { type: "unshield", feeManagerAddress, amount?, from?, to? }]` |
| fees (batchTransfer)   | `["batchTransferFee", feeManagerAddr]`                  | `["zama.fees", { type: "batchTransfer", feeManagerAddress }]`                 |
| fees (feeRecipient)    | `["feeRecipient", feeManagerAddr]`                      | `["zama.fees", { type: "feeRecipient", feeManagerAddress }]`                  |
| publicKey              | `["publicKey"]`                                         | `["zama.publicKey"]`                                                          |
| publicParams           | `["publicParams", bits]`                                | `["zama.publicParams", { bits }]`                                             |
| activityFeed           | `["activityFeed", tokenAddr, userAddr, logsKey]`        | `["zama.activityFeed", { tokenAddress, userAddress, logsKey, decrypt }]`      |
| signerAddress          | `["zama", "signer-address", tokenAddr]`                 | `["zama.signerAddress", { tokenAddress }]`                                    |

> **Note:** Mutation keys are NOT namespaced. `["shield", tokenAddr]`, `["confidentialTransfer", tokenAddr]`, `["authorizeAll"]`, `["encrypt"]` etc. remain as-is.

### Factory Signature Changes

#### Decoupled query factories (now take `signer + address`, not `token`)

```ts
// OLD (react-sdk inline factory)
tokenMetadataQueryOptions(token: ReadonlyToken)
// key: ["tokenMetadata", tokenAddress]

// NEW (@zama-fhe/sdk/query)
tokenMetadataQueryOptions(signer: GenericSigner, tokenAddress: Address, config?)
// key: ["zama.tokenMetadata", { tokenAddress }]
```

Same pattern for: `isConfidentialQueryOptions`, `isWrapperQueryOptions`, `totalSupplyQueryOptions`, `wrapperDiscoveryQueryOptions`, `underlyingAllowanceQueryOptions`, `confidentialIsApprovedQueryOptions`, all fee factories.

#### Token-coupled factories (still take `token`)

```ts
// @zama-fhe/sdk/query — Token is not serializable, so closed over
confidentialBalanceQueryOptions(token: ReadonlyToken, config: { owner?, handle?, query? })
activityFeedQueryOptions(token: ReadonlyToken, config: ActivityFeedConfig)
// All mutation factories: shieldMutationOptions(token: Token), etc.
```

#### `authorizeAllMutationOptions` — variable shape BREAKING change

```ts
// OLD: mutate(tokenAddresses: Address[])
const auth = useAuthorizeAll();
auth.mutate(["0xToken1", "0xToken2"]);

// NEW: mutate({ tokenAddresses: Address[] })
auth.mutate({ tokenAddresses: ["0xToken1", "0xToken2"] });
```

---

## 4. Critical Implementation Patterns (for reference)

### `useConfidentialBalance` — Two-phase composition (ALREADY DONE)

```ts
// react-sdk/src/token/use-confidential-balance.ts (current state)
import { useQuery } from "@tanstack/react-query";
import {
  confidentialBalanceQueryOptions,
  confidentialHandleQueryOptions,
  hashFn,
  signerAddressQueryOptions,
} from "@zama-fhe/sdk/query";
import { useReadonlyToken } from "./use-readonly-token";

export function useConfidentialBalance(config, options?) {
  const token = useReadonlyToken(config.tokenAddress);

  const addressQuery = useQuery({
    ...signerAddressQueryOptions(token.signer, config.tokenAddress),
    queryKeyHashFn: hashFn,
  });
  const owner = addressQuery.data;

  // Phase 1: poll handle
  const handleQuery = useQuery({
    ...confidentialHandleQueryOptions(token.signer, config.tokenAddress, {
      owner,
      pollingInterval: config.handleRefetchInterval,
    }),
    queryKeyHashFn: hashFn,
  });

  // Phase 2: decrypt on handle change
  const balanceQuery = useQuery({
    ...confidentialBalanceQueryOptions(token, {
      handle: handleQuery.data,
      owner,
    }),
    ...options,
    queryKeyHashFn: hashFn,
  });

  return { ...balanceQuery, handleQuery };
}
```

### `useShield` — Mutation with optimistic update and invalidation (ALREADY DONE)

```ts
// Actual current implementation uses:
// - shieldMutationOptions(token) from @zama-fhe/sdk/query
// - applyOptimisticBalanceDelta / rollbackOptimisticBalanceDelta helpers
// - invalidateAfterShield(context.client, tokenAddress) in onSuccess
```

---

## 5. File Paths Reference

### react-sdk hooks (ALL already refactored):

```
packages/react-sdk/src/
├── token/
│   ├── use-token-metadata.ts         ✓ imports from sdk/query
│   ├── use-is-confidential.ts        ✓ imports from sdk/query
│   ├── use-total-supply.ts           ✓ imports from sdk/query
│   ├── use-wrapper-discovery.ts      ✓ imports from sdk/query
│   ├── use-underlying-allowance.ts   ✓ imports from sdk/query
│   ├── use-confidential-is-approved.ts ✓ imports from sdk/query
│   ├── use-fees.ts                   ✓ imports from sdk/query
│   ├── use-confidential-balance.ts   ✓ 3-query composition pattern
│   ├── use-confidential-balances.ts  ✓ batch composition pattern
│   ├── use-activity-feed.ts          ✓ imports from sdk/query
│   ├── use-shield.ts                 ✓ mutation + invalidateAfterShield
│   ├── use-shield-eth.ts             ✓ mutation + invalidateAfterShield
│   ├── use-confidential-transfer.ts  ✓ mutation + invalidateBalanceQueries
│   ├── use-confidential-transfer-from.ts ✓ mutation + invalidateBalanceQueries
│   ├── use-confidential-approve.ts   ✓ mutation + invalidateAfterApprove
│   ├── use-approve-underlying.ts     ✓ mutation (no invalidation needed)
│   ├── use-unshield.ts               ✓ mutation + invalidateAfterUnshield
│   ├── use-unshield-all.ts           ✓ mutation + invalidateAfterUnshield
│   ├── use-resume-unshield.ts        ✓ mutation + invalidateAfterUnshield
│   ├── use-unwrap.ts                 ✓ mutation
│   ├── use-unwrap-all.ts             ✓ mutation
│   ├── use-finalize-unwrap.ts        ✓ mutation + invalidateAfterUnshield
│   ├── use-authorize-all.ts          ✓ mutation (no invalidation)
│   └── balance-query-keys.ts         ✓ DELETED
├── relayer/
│   ├── use-public-key.ts             ✓ imports from sdk/query
│   ├── use-public-params.ts          ✓ imports from sdk/query
│   └── use-encrypt.ts                ✓ imports from sdk/query
└── index.ts                          ✓ re-exports from @zama-fhe/sdk/query
```

### Test files (ALL already updated):

```
packages/react-sdk/src/__tests__/
├── balance-query-keys.test.ts  ✓ DELETED
├── query-options.test.ts       ✓ imports from @zama-fhe/sdk/query, new key assertions
├── mutation-options.test.ts    ✓ imports from @zama-fhe/sdk/query
├── query-hooks.test.tsx        ✓ behavioral tests (no key assertions)
└── mutation-hooks.test.tsx     ✓ uses zamaQueryKeys.confidentialBalance.*
```

### Changeset:

```
.changeset/react-hooks-refactor.md  ✓ EXISTS — major breaking change with migration guide
```

---

## 6. Open Questions / Potential Issues

1. **Mutation key shape issue in `mutation-options.test.ts`**: The test file in `react-sdk/__tests__/` checks mutation keys like `["shield", TOKEN_ADDR]` (flat, not namespaced). The actual `sdk/query/shield.ts` uses `["shield", token.address] as const`. This is **correct** — the RFC intentionally kept mutation keys flat (only query keys got the `zama.` namespace treatment).

2. **`wrapperDiscovery` coordinator not in key**: `zamaQueryKeys.wrapperDiscovery.token(tokenAddress)` doesn't include `coordinatorAddress`. If same token has multiple coordinators, cache collisions could occur. RFC accepts this tradeoff — coordinator in closure, not key.

3. **`underlyingAllowance` / `confidentialIsApproved` keys use only `{ tokenAddress }`**: Allowance is per-owner, and approval is per-spender/owner. Queries with different owners/spenders for the same token share a cache key. The hook fetches signer address and passes it in config, but different users must not share a QueryClient for this to be safe.

4. **MIGRATION.md missing**: The only remaining deliverable. Changeset has brief notes; a full standalone doc is needed.

5. **Build/typecheck/test verification**: The code looks complete but `pnpm typecheck`, `pnpm test:run`, `pnpm build` have not been confirmed to pass. The implementor should verify.

---

## 7. Quick Verification Commands

```bash
# In /Users/msaug/zama/token-sdk
pnpm typecheck          # should pass
pnpm test:run           # should pass (sdk + react-sdk)
pnpm build              # should pass (both packages)

# Verify sdk/query subpath works
node -e "import('@zama-fhe/sdk/query').then(m => console.log(Object.keys(m)))"

# Run only affected tests
pnpm --filter @zama-fhe/sdk test:run
pnpm --filter @zama-fhe/react-sdk test:run
```
