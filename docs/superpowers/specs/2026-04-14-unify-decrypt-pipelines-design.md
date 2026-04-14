# Unify All Decrypt Flows Through Shared Pipelines

**Branch:** `feature/sdk-82-route-readonly-token-decrypthandles-through-unified`
**Issue:** SDK-82, PR #227

## Problem

Three decrypt entry points call `relayer.userDecrypt()` / `relayer.delegatedUserDecrypt()` directly instead of going through the shared pipelines introduced in the first commit on this branch:

1. `ReadonlyToken.decryptBalance` — manual cache, credentials, relayer call
2. `ReadonlyToken.decryptBalanceAs` — same, delegated variant
3. `ZamaSDK.userDecrypt` — duplicate of pipeline logic inline

Additionally, `credentials.allow()` in both pipelines receives only uncached contract addresses, causing credential cache key mismatch when a parallel `allow()` call uses all addresses (PR #227 bug).

## Changes

### 1. Remove `owner` param from `decryptBalance` and `decryptHandles`

`decryptBalance(handle, owner?)` passes `owner` as both cache key and `signerAddress` to the relayer. Credentials are signer-bound, so a different address is cryptographically meaningless — the relayer rejects mismatched signer addresses.

All production callers pass the connected signer's address:

- `balanceOf(owner)` resolves `owner` via `signer.getAddress()` then passes it through
- `#assertConfidentialBalance` derives `userAddress` from the signer
- `confidentialBalanceQueryOptions` passes `keyOwner` which is the connected signer in all TanStack Query contexts

Remove the parameter. `decryptBalance` always uses `signer.getAddress()` via the pipeline.

`decryptHandles` already marks `_owner` as unused — remove it entirely.

### 2. Route `decryptBalance` through `runUserDecryptPipeline`

After removing `owner`, `decryptBalance` becomes:

```
async decryptBalance(handle): Promise<bigint>
  if zeroHandle → return 0n
  emit DecryptStart
  result = await runUserDecryptPipeline([{ handle, contractAddress: this.address }], deps)
  emit DecryptEnd
  extract and return bigint value
  on error: emit DecryptError, wrap via wrapDecryptError
```

The pipeline handles cache lookup, credential acquisition, contract grouping, relayer call, and cache write.

### 3. Route `ZamaSDK.userDecrypt` through `runUserDecryptPipeline`

Replace the inline cache-peek + group-by-contract + relayer-call logic with:

```
async userDecrypt(handles, options?): Promise<Record<Handle, ClearValueType>>
  if empty → return {}
  // Peek cache to decide whether to fire onCredentialsReady
  hasUncached = check if any handle is not in cache
  result = await runUserDecryptPipeline(handles, deps)
  if hasUncached: onCredentialsReady()
  onDecrypted(result)
  return result
```

The cache peek for `onCredentialsReady` stays — it's a UI callback that fires after credentials are obtained but before the pipeline returns. The pipeline itself does the real cache check.

### 4. Fix credential dedup in pipelines

Both `runUserDecryptPipeline` and `runDelegatedDecryptPipeline` currently call:

```ts
const contractAddresses = [...new Set(uncached.map((h) => h.contractAddress))];
const creds = await deps.credentials.allow(...contractAddresses);
```

Change to collect ALL contract addresses from the full input (before filtering to uncached):

```ts
const allContractAddresses = [...new Set(handles.map((h) => h.contractAddress))];
// ... cache filtering ...
const creds = await deps.credentials.allow(...allContractAddresses);
```

This makes the credential cache key stable: `allow(A, B)` always produces the same key regardless of which handles are cached. A parallel `allow(A, B)` from another call site deduplicates correctly.

## Files Changed

| File                                               | Change                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/pipelines/user-decrypt-pipeline.ts`           | Collect all contract addresses before cache filter; pass to `allow()`                                                         |
| `src/pipelines/delegated-user-decrypt-pipeline.ts` | Same credential dedup fix                                                                                                     |
| `src/token/readonly-token.ts`                      | Remove `owner` from `decryptBalance`; route through pipeline. Remove `_owner` from `decryptHandles`.                          |
| `src/zama-sdk.ts`                                  | Replace inline decrypt logic with `runUserDecryptPipeline` call                                                               |
| `src/query/confidential-balance.ts`                | Remove second arg from `token.decryptBalance(handle, owner)` → `token.decryptBalance(handle)`                                 |
| `src/token/token.ts`                               | Remove `owner` arg from `this.decryptBalance(handle, userAddress)` in `#assertConfidentialBalance`                            |
| Test files                                         | Update `decryptBalance` / `decryptHandles` tests for removed `owner` param; update credential assertions for full address set |

## Not Changed

- `ReadonlyToken.decryptBalanceAs` — delegated single-handle decrypt. Could route through `runDelegatedDecryptPipeline` but has extra delegation-specific logic (pre-flight check, `normalizedDelegator`). Out of scope for this pass; the batch path already uses the pipeline.
- `query/delegated-user-decrypt.ts` — calls `sdk.relayer.delegatedUserDecrypt()` directly. This is a raw query option for advanced users. Out of scope.

## Testing

- All existing tests pass with updated signatures
- Credential dedup: assert `credentials.allow()` receives ALL contract addresses, not just uncached subset
- `ZamaSDK.userDecrypt`: assert `onCredentialsReady` fires only when uncached handles exist
