# Research Context: sdk-query-subpath

**Unit:** `sdk-query-subpath`
**Title:** Create `@zama-fhe/sdk/query` Subpath with All Factories
**Date:** 2026-03-02
**RFC:** `/Users/msaug/zama/token-sdk/TASK_1.md`

---

## IMPLEMENTATION STATUS: ✓ COMPLETE

All files specified in the RFC have been created. The `packages/sdk/src/query/` directory is fully implemented with factories, utilities, tests, and package configuration. This research document describes the complete implementation as it exists.

---

## Overview

This unit creates the entire `packages/sdk/src/query/` directory implementing the **Layer 2** (query/mutation options factories) of the three-layer TanStack Query architecture. The wagmi pattern is the reference: Layer 1 (actions) → Layer 2 (query options factories) → Layer 3 (thin React hooks).

---

## Spec Summary (from TASK_1.md)

### What was created

**New subpath:** `@zama-fhe/sdk/query`
**New directory:** `packages/sdk/src/query/`

#### Factory tier classification (as implemented)

| Tier              | Args                      | Examples                                                                                                                                                                                                              |
| ----------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Decoupled**     | `GenericSigner + Address` | `tokenMetadata`, `isConfidential`, `isWrapper`, `totalSupply`, `wrapperDiscovery`, `underlyingAllowance`, `confidentialIsApproved`, all 4 fee factories, `confidentialHandle`, `confidentialHandles`, `signerAddress` |
| **Token-coupled** | `ReadonlyToken` / `Token` | `confidentialBalance`, `confidentialBalances`, `activityFeed`, all 14 mutation factories                                                                                                                              |
| **SDK-coupled**   | `ZamaSDK`                 | `publicKey`, `publicParams`, `encrypt`, `authorizeAll`                                                                                                                                                                |

**Note:** `confidentialHandles` was implemented as **decoupled** (takes `GenericSigner`), not token-coupled as originally suggested in early research. This aligns with the RFC intent (only needs `signer.readContract`).

**Note:** `publicKey`/`publicParams`/`encrypt`/`authorizeAll` take `ZamaSDK` (full SDK) rather than `RelayerSDK` directly for simplicity. Both use `sdk.relayer.getPublicKey()` etc.

#### `queryFn` param-sourcing rules

1. **Decoupled factories**: extract data params from `context.queryKey` (NOT closure). Only `signer` (infrastructure) is closed over.
2. **Token-coupled factories**: close over `token` instance (not serializable). `token.address` in key identifies the cache entry; closure provides decrypt/write methods.

---

## Files Created (✓ VERIFIED)

### Core utilities & infrastructure

| File                                      | Purpose                                                                                                                                   | Status                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `packages/sdk/src/query/utils.ts`         | `filterQueryOptions`, `hashFn`, `isPlainObject`                                                                                           | ✓ EXISTS                         |
| `packages/sdk/src/query/query-keys.ts`    | `zamaQueryKeys` with `zama.` namespace prefix                                                                                             | ✓ EXISTS                         |
| `packages/sdk/src/query/invalidation.ts`  | `invalidateBalanceQueries`, `invalidateAfterShield`, `invalidateAfterUnshield`, `invalidateAfterApprove`, `invalidateWagmiBalanceQueries` | ✓ EXISTS                         |
| `packages/sdk/src/query/factory-types.ts` | `QueryContext`, `QueryFactoryOptions`, `MutationFactoryOptions` interfaces                                                                | ✓ EXISTS (extra file beyond RFC) |
| `packages/sdk/src/query/index.ts`         | Barrel export for `@zama-fhe/sdk/query`                                                                                                   | ✓ EXISTS                         |

### Query options factories (14 files — 13 from RFC + 1 extra)

| File                          | Factory                                                                                                        | Tier          | staleTime                       | Status           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------- | ---------------- |
| `signer-address.ts`           | `signerAddressQueryOptions(signer, tokenAddress, config?)`                                                     | Decoupled     | `30_000`                        | ✓ EXISTS (extra) |
| `token-metadata.ts`           | `tokenMetadataQueryOptions(signer, tokenAddress, config?)`                                                     | Decoupled     | `Infinity`                      | ✓ EXISTS         |
| `is-confidential.ts`          | `isConfidentialQueryOptions`, `isWrapperQueryOptions`                                                          | Decoupled     | `Infinity`                      | ✓ EXISTS         |
| `total-supply.ts`             | `totalSupplyQueryOptions(signer, tokenAddress, config?)`                                                       | Decoupled     | `30_000`                        | ✓ EXISTS         |
| `wrapper-discovery.ts`        | `wrapperDiscoveryQueryOptions(signer, tokenAddress, config)`                                                   | Decoupled     | `Infinity`                      | ✓ EXISTS         |
| `underlying-allowance.ts`     | `underlyingAllowanceQueryOptions(signer, tokenAddress, config?)`                                               | Decoupled     | `30_000`                        | ✓ EXISTS         |
| `confidential-is-approved.ts` | `confidentialIsApprovedQueryOptions(signer, tokenAddress, config?)`                                            | Decoupled     | `30_000`                        | ✓ EXISTS         |
| `fees.ts`                     | `shieldFeeQueryOptions`, `unshieldFeeQueryOptions`, `batchTransferFeeQueryOptions`, `feeRecipientQueryOptions` | Decoupled     | `30_000`                        | ✓ EXISTS         |
| `public-key.ts`               | `publicKeyQueryOptions(sdk: ZamaSDK, config?)`                                                                 | SDK-coupled   | `Infinity`                      | ✓ EXISTS         |
| `public-params.ts`            | `publicParamsQueryOptions(sdk: ZamaSDK, bits, config?)`                                                        | SDK-coupled   | `Infinity`                      | ✓ EXISTS         |
| `confidential-handle.ts`      | `confidentialHandleQueryOptions(signer, tokenAddress, config?)`                                                | Decoupled     | N/A (`refetchInterval: 10_000`) | ✓ EXISTS         |
| `confidential-balance.ts`     | `confidentialBalanceQueryOptions(token: ReadonlyToken, config?)`                                               | Token-coupled | `Infinity`                      | ✓ EXISTS         |
| `confidential-handles.ts`     | `confidentialHandlesQueryOptions(signer, tokenAddresses, config?)`                                             | **Decoupled** | N/A (`refetchInterval: 10_000`) | ✓ EXISTS         |
| `confidential-balances.ts`    | `confidentialBalancesQueryOptions(tokens: ReadonlyToken[], config?)`                                           | Token-coupled | `Infinity`                      | ✓ EXISTS         |
| `activity-feed.ts`            | `activityFeedQueryOptions(token, config, queryConfig?)`                                                        | Token-coupled | `Infinity`                      | ✓ EXISTS         |

### Mutation options factories (14 files)

| File                    | Factory                                          | MutationKey                                   | Status   |
| ----------------------- | ------------------------------------------------ | --------------------------------------------- | -------- |
| `shield.ts`             | `shieldMutationOptions(token)`                   | `['shield', token.address]`                   | ✓ EXISTS |
| `shield-eth.ts`         | `shieldETHMutationOptions(token)`                | `['shieldETH', token.address]`                | ✓ EXISTS |
| `transfer.ts`           | `confidentialTransferMutationOptions(token)`     | `['confidentialTransfer', token.address]`     | ✓ EXISTS |
| `transfer-from.ts`      | `confidentialTransferFromMutationOptions(token)` | `['confidentialTransferFrom', token.address]` | ✓ EXISTS |
| `approve.ts`            | `confidentialApproveMutationOptions(token)`      | `['confidentialApprove', token.address]`      | ✓ EXISTS |
| `approve-underlying.ts` | `approveUnderlyingMutationOptions(token)`        | `['approveUnderlying', token.address]`        | ✓ EXISTS |
| `unshield.ts`           | `unshieldMutationOptions(token)`                 | `['unshield', token.address]`                 | ✓ EXISTS |
| `unshield-all.ts`       | `unshieldAllMutationOptions(token)`              | `['unshieldAll', token.address]`              | ✓ EXISTS |
| `resume-unshield.ts`    | `resumeUnshieldMutationOptions(token)`           | `['resumeUnshield', token.address]`           | ✓ EXISTS |
| `unwrap.ts`             | `unwrapMutationOptions(token)`                   | `['unwrap', token.address]`                   | ✓ EXISTS |
| `unwrap-all.ts`         | `unwrapAllMutationOptions(token)`                | `['unwrapAll', token.address]`                | ✓ EXISTS |
| `finalize-unwrap.ts`    | `finalizeUnwrapMutationOptions(token)`           | `['finalizeUnwrap', token.address]`           | ✓ EXISTS |
| `encrypt.ts`            | `encryptMutationOptions(sdk: ZamaSDK)`           | `['encrypt']`                                 | ✓ EXISTS |
| `authorize-all.ts`      | `authorizeAllMutationOptions(sdk: ZamaSDK)`      | `['authorizeAll']`                            | ✓ EXISTS |

### Test infrastructure

| File                                               | Purpose                                                                                                              | Status   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------- |
| `packages/sdk/src/query/__tests__/test-helpers.ts` | `createMockSigner()`, `createMockStorage()`, `createMockRelayer()`, `createMockReadonlyToken()`, `createMockToken()` | ✓ EXISTS |

### Test files (30 total — 29 from RFC + 1 extra for signer-address)

```
__tests__/
├── utils.test.ts                     ✓
├── query-keys.test.ts                ✓
├── invalidation.test.ts              ✓
├── signer-address.test.ts            ✓ (extra, beyond RFC list)
├── token-metadata.test.ts            ✓
├── is-confidential.test.ts           ✓
├── total-supply.test.ts              ✓
├── wrapper-discovery.test.ts         ✓
├── underlying-allowance.test.ts      ✓
├── confidential-is-approved.test.ts  ✓
├── fees.test.ts                      ✓
├── public-key.test.ts                ✓
├── public-params.test.ts             ✓
├── confidential-handle.test.ts       ✓
├── confidential-balance.test.ts      ✓
├── confidential-handles.test.ts      ✓
├── confidential-balances.test.ts     ✓
├── activity-feed.test.ts             ✓
├── shield.test.ts                    ✓
├── shield-eth.test.ts                ✓
├── transfer.test.ts                  ✓
├── transfer-from.test.ts             ✓
├── approve.test.ts                   ✓
├── approve-underlying.test.ts        ✓
├── unshield.test.ts                  ✓
├── unshield-all.test.ts              ✓
├── resume-unshield.test.ts           ✓
├── unwrap.test.ts                    ✓
├── unwrap-all.test.ts                ✓
├── finalize-unwrap.test.ts           ✓
├── encrypt.test.ts                   ✓
└── authorize-all.test.ts             ✓
```

---

## Package Configuration (✓ ALL COMPLETE)

### `packages/sdk/package.json`

- `./query` subpath export: ✓ `{ "types": "./dist/query/index.d.ts", "import": "./dist/query/index.js" }`
- `@tanstack/query-core: ">=5"` peer dep: ✓
- `peerDependenciesMeta: { "@tanstack/query-core": { "optional": true } }`: ✓
- `@tanstack/query-core: "^5.90.20"` in devDependencies: ✓

### `packages/sdk/tsup.config.ts`

- `"query/index": "src/query/index.ts"` entry: ✓
- `@tanstack/query-core` in external: ✓

### API Extractor

- `packages/sdk/api-extractor.query.json`: ✓ EXISTS
- `packages/sdk/etc/sdk-query.api.md`: ✓ EXISTS (generated report)

---

## Key Implementation Details

### `factory-types.ts` — shared interfaces (extra file beyond RFC)

```ts
export interface QueryContext<TQueryKey extends readonly unknown[]> {
  queryKey: TQueryKey;
}

export interface QueryFactoryOptions<TQueryKey extends readonly unknown[], TData> {
  queryKey: TQueryKey;
  queryFn: (context: QueryContext<TQueryKey>) => Promise<TData>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}

export interface MutationFactoryOptions<
  TMutationKey extends readonly unknown[],
  TVariables,
  TData,
> {
  mutationKey: TMutationKey;
  mutationFn: (variables: TVariables) => Promise<TData>;
}
```

### Spread order (critical for correctness)

```ts
return {
  queryKey,                          // factory always wins
  queryFn: async (context) => { ... }, // factory always wins
  staleTime: Infinity,               // factory always wins
  enabled: Boolean(...),             // factory always wins (gates on required params)
  ...filterQueryOptions(config?.query ?? {}),  // user pass-through LAST (non-conflicting only)
};
```

Note: The actual implementation spreads `filterQueryOptions(config?.query ?? {})` LAST (not first). This differs from the RFC's diagram but is equivalent for `queryKey`/`queryFn`/`staleTime`/`enabled` since `filterQueryOptions` strips those keys. The net result: user can only pass through `select`, `gcTime`, etc. (non-conflicting).

### `zamaQueryKeys` — complete key namespace (from `query-keys.ts`)

All keys use `['zama.<name>', { ...params }]` 2-element tuple. The `decryption` namespace was added beyond the RFC spec:

```ts
decryption: {
  all: ['zama.decryption'] as const,
  handle: (handle, contractAddress) => ['zama.decryption', { handle, contractAddress }] as const,
}
```

### `invalidation.ts` — implementation detail

```ts
function isWagmiBalanceQuery(query: Query): boolean {
  return (
    Array.isArray(query.queryKey) &&
    query.queryKey.some((part) => {
      if (typeof part !== "object" || part === null || !("functionName" in part)) return false;
      return part.functionName === "balanceOf";
    })
  );
}
```

### `confidentialHandles` — decoupled (key design decision)

The RFC labeled `confidentialHandles` as token-coupled but the implementation uses `signer: GenericSigner` because it only calls `signer.readContract(confidentialBalanceOfContract(...))` — no FHE, no Token class needed.

```ts
export function confidentialHandlesQueryOptions(
  signer: GenericSigner, // decoupled!
  tokenAddresses: Address[],
  config?: ConfidentialHandlesQueryConfig,
);
```

### `confidentialBalance` — decryptBalance signature

The implementation calls `token.decryptBalance(handle, owner)` with TWO args:

```ts
queryFn: async (context) => {
  const [, { owner: keyOwner, handle: keyHandle }] = context.queryKey;
  return token.decryptBalance((keyHandle ?? '') as Address, keyOwner as Address);
},
```

### `activityFeed` — queryFn structure

```ts
queryFn: async () => {
  if (!config.logs || !config.userAddress) return [];
  const parsed = parseActivityFeed(config.logs, config.userAddress);
  if (!decrypt) return sortByBlockNumber(parsed);
  const handles = extractEncryptedHandles(parsed) as Address[];
  if (handles.length === 0) return sortByBlockNumber(parsed);
  const decrypted = await token.decryptHandles(handles, config.userAddress);
  return sortByBlockNumber(applyDecryptedValues(parsed, decrypted));
},
```

Note: `activityFeed` closes over `config.logs` and `config.userAddress` (not from `context.queryKey`). The `logsKey` in the queryKey serves as a cache fingerprint, but the actual log data comes from the closure. This is intentional — logs are too large to serialize into a queryKey.

### `test-helpers.ts` — richer mock factory than RFC spec

The implementation adds `createMockStorage()` and `createMockRelayer()` beyond the RFC spec (needed for `authorizeAll`/`encrypt` tests that construct real `ZamaSDK` instances).

---

## `zamaQueryKeys` — Query Key Shapes (Quick Reference)

```ts
zamaQueryKeys.signerAddress.all                          // ['zama.signerAddress']
zamaQueryKeys.signerAddress.token(addr)                  // ['zama.signerAddress', { tokenAddress }]

zamaQueryKeys.confidentialHandle.all                     // ['zama.confidentialHandle']
zamaQueryKeys.confidentialHandle.token(addr)             // ['zama.confidentialHandle', { tokenAddress }]
zamaQueryKeys.confidentialHandle.owner(addr, owner)      // ['zama.confidentialHandle', { tokenAddress, owner }]

zamaQueryKeys.confidentialBalance.all                    // ['zama.confidentialBalance']
zamaQueryKeys.confidentialBalance.token(addr)            // ['zama.confidentialBalance', { tokenAddress }]
zamaQueryKeys.confidentialBalance.owner(addr, owner, handle?)  // ['zama.confidentialBalance', { tokenAddress, owner, ?handle }]

zamaQueryKeys.confidentialHandles.all                    // ['zama.confidentialHandles']
zamaQueryKeys.confidentialHandles.tokens(addrs, owner)   // ['zama.confidentialHandles', { tokenAddresses, owner }]

zamaQueryKeys.confidentialBalances.all                   // ['zama.confidentialBalances']
zamaQueryKeys.confidentialBalances.tokens(addrs, owner)  // ['zama.confidentialBalances', { tokenAddresses, owner }]

zamaQueryKeys.tokenMetadata.all                          // ['zama.tokenMetadata']
zamaQueryKeys.tokenMetadata.token(addr)                  // ['zama.tokenMetadata', { tokenAddress }]

zamaQueryKeys.isConfidential.token(addr)                 // ['zama.isConfidential', { tokenAddress }]
zamaQueryKeys.isWrapper.token(addr)                      // ['zama.isWrapper', { tokenAddress }]
zamaQueryKeys.wrapperDiscovery.token(addr)               // ['zama.wrapperDiscovery', { tokenAddress }]
zamaQueryKeys.underlyingAllowance.token(addr)            // ['zama.underlyingAllowance', { tokenAddress }]
zamaQueryKeys.confidentialIsApproved.token(addr)         // ['zama.confidentialIsApproved', { tokenAddress }]
zamaQueryKeys.totalSupply.token(addr)                    // ['zama.totalSupply', { tokenAddress }]

zamaQueryKeys.activityFeed.all                           // ['zama.activityFeed']
zamaQueryKeys.activityFeed.token(addr)                   // ['zama.activityFeed', { tokenAddress }]
zamaQueryKeys.activityFeed.scope(addr, user, logs, decrypt) // ['zama.activityFeed', { tokenAddress, userAddress, logsKey, decrypt }]

zamaQueryKeys.fees.all                                   // ['zama.fees']
zamaQueryKeys.fees.shieldFee(feeManager, amount?, from?, to?)    // ['zama.fees', { type: 'shield', feeManagerAddress, ?amount, ?from, ?to }]
zamaQueryKeys.fees.unshieldFee(feeManager, amount?, from?, to?)  // ['zama.fees', { type: 'unshield', ... }]
zamaQueryKeys.fees.batchTransferFee(feeManager)          // ['zama.fees', { type: 'batchTransfer', feeManagerAddress }]
zamaQueryKeys.fees.feeRecipient(feeManager)              // ['zama.fees', { type: 'feeRecipient', feeManagerAddress }]

zamaQueryKeys.publicKey.all                              // ['zama.publicKey']
zamaQueryKeys.publicParams.all                           // ['zama.publicParams']
zamaQueryKeys.publicParams.bits(bits)                    // ['zama.publicParams', { bits }]

zamaQueryKeys.decryption.all                             // ['zama.decryption']
zamaQueryKeys.decryption.handle(handle, contractAddr)    // ['zama.decryption', { handle, contractAddress }]
```

---

## Invalidation Helpers Summary

```ts
invalidateBalanceQueries(qc, tokenAddress); // confidentialHandle.token + confidentialHandles.all + reset confidentialBalance.token + confidentialBalances.all
invalidateAfterShield(qc, tokenAddress); // invalidateBalanceQueries + underlyingAllowance.token + wagmiBalanceOf predicate
invalidateAfterUnshield(qc, tokenAddress); // same as invalidateAfterShield
invalidateAfterApprove(qc, tokenAddress); // confidentialIsApproved.token
invalidateWagmiBalanceQueries(qc); // predicate: functionName === 'balanceOf' in any part of queryKey
```

---

## Testing Strategy (Implemented)

### Layer 1 tests (`utils.test.ts`, `query-keys.test.ts`, `signer-address.test.ts`)

- Pure unit tests, no mocks needed for utils/query-keys
- `filterQueryOptions`: strips all 22 behavioral options, preserves data params
- `hashFn`: bigint → string, deterministic key ordering via Object.keys().sort()
- `zamaQueryKeys`: all keys start with `zama.`, correct shapes, prefix matching

### Layer 2 tests (factory files)

**Per query factory, verifies:**

1. Correct `queryKey` shape
2. `queryFn` calls correct signer/token method
3. For decoupled: `queryFn` extracts data params from `context.queryKey` (verified by passing alternative key)
4. `staleTime` value
5. `enabled` gating on required params
6. `enabled` gating on `query: { enabled: false }`

**Per mutation factory:**

1. Correct `mutationKey` shape
2. `mutationFn` calls correct token method with correct args

**Invalidation helpers:**

- Mock `QueryClient` with `vi.fn()` on `invalidateQueries`/`resetQueries`
- Verify correct key shapes passed to each method
- Wagmi predicate test: matches `{ functionName: 'balanceOf' }`, rejects `{ functionName: 'name' }`

### Test infrastructure

```ts
createMockSigner(); // GenericSigner: getAddress, readContract, writeContract, etc.
createMockStorage(); // GenericStringStorage: getItem, setItem, removeItem
createMockRelayer(); // RelayerSDK: getPublicKey, getPublicParams, encrypt, userDecrypt, etc.
createMockReadonlyToken(); // ReadonlyToken: address, signer, decryptBalance, decryptHandles
createMockToken(); // Token: extends ReadonlyToken + shield, unshield, transfer, etc.
```

---

## Files to Modify (context for react-hooks-refactor unit)

These are NOT part of this unit but will be needed by the react-hooks-refactor unit:

| File                                                  | Change                                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `packages/react-sdk/src/token/use-*.ts` (each hook)   | Import factory from `@zama-fhe/sdk/query`, remove inline definitions                     |
| `packages/react-sdk/src/relayer/use-*.ts` (each hook) | Same                                                                                     |
| `packages/react-sdk/src/index.ts`                     | Re-export factories from `@zama-fhe/sdk/query`                                           |
| Root `package.json`                                   | Update `api-report:sdk` and `api-report:check:sdk` to include `api-extractor.query.json` |

---

## Vitest Config Note

The wildcard alias handles subpath resolution:

```ts
{ find: /^@zama-fhe\/sdk\/(.+)/, replacement: path.resolve(__dirname, "./packages/sdk/src/$1") }
```

`@zama-fhe/sdk/query` → `./packages/sdk/src/query` — **no vitest config change needed**.

---

## Relevant File Paths

### Core implementation

- `/Users/msaug/zama/token-sdk/packages/sdk/src/query/` — all factories
- `/Users/msaug/zama/token-sdk/packages/sdk/src/query/__tests__/` — all tests
- `/Users/msaug/zama/token-sdk/packages/sdk/src/query/index.ts` — barrel export
- `/Users/msaug/zama/token-sdk/packages/sdk/src/query/utils.ts` — filterQueryOptions, hashFn
- `/Users/msaug/zama/token-sdk/packages/sdk/src/query/query-keys.ts` — zamaQueryKeys
- `/Users/msaug/zama/token-sdk/packages/sdk/src/query/invalidation.ts` — cache helpers
- `/Users/msaug/zama/token-sdk/packages/sdk/src/query/factory-types.ts` — shared types

### SDK package config

- `/Users/msaug/zama/token-sdk/packages/sdk/package.json`
- `/Users/msaug/zama/token-sdk/packages/sdk/tsup.config.ts`
- `/Users/msaug/zama/token-sdk/packages/sdk/api-extractor.query.json`
- `/Users/msaug/zama/token-sdk/packages/sdk/etc/sdk-query.api.md`

### Core SDK types used by factories

- `/Users/msaug/zama/token-sdk/packages/sdk/src/token/token.types.ts` — `GenericSigner`, `Address`, `TransactionResult`
- `/Users/msaug/zama/token-sdk/packages/sdk/src/token/readonly-token.ts` — `ReadonlyToken` class
- `/Users/msaug/zama/token-sdk/packages/sdk/src/token/token.ts` — `Token` class
- `/Users/msaug/zama/token-sdk/packages/sdk/src/token/zama-sdk.ts` — `ZamaSDK` class
- `/Users/msaug/zama/token-sdk/packages/sdk/src/contracts/index.ts` — contract builders
- `/Users/msaug/zama/token-sdk/packages/sdk/src/activity.ts` — activity feed helpers

### RFC

- `/Users/msaug/zama/token-sdk/TASK_1.md`

### react-sdk (context for future react-hooks-refactor unit)

- `/Users/msaug/zama/token-sdk/packages/react-sdk/src/token/` — hooks with inline factories to remove
- `/Users/msaug/zama/token-sdk/packages/react-sdk/src/relayer/` — relayer hooks
- `/Users/msaug/zama/token-sdk/packages/react-sdk/src/token/balance-query-keys.ts` — OLD keys (to delete)
