# Fix delegation hook callback ordering

## Summary
`useDelegateDecryption` and `useRevokeDelegation` fire cache invalidation BEFORE `onSuccess` callback. Every other mutation hook does the reverse.

## Severity
High (bug)

## Files to change
- `packages/react-sdk/src/token/use-delegate-decryption.ts` (lines 32-37)
- `packages/react-sdk/src/token/use-revoke-delegation.ts` (lines 32-37)

## Change
Swap two lines in each file so `options?.onSuccess?.(...)` fires before `invalidateQueries`, matching all other hooks.

## Accept if
The inverted ordering is unintentional and no consumer depends on cache being invalidated before their onSuccess fires.

## Source
summary.md IMP-0001


# Fix revokeSession bypassing clearCaches

## Summary
`ZamaSDK.revokeSession()` and `#revokeByTrackedIdentity()` call `sessionStorage.delete()` directly, skipping `credentials.clearCaches()`. This leaves stale AES-GCM derived keys in memory after account switch.

## Severity
High (bug)

## Files to change
- `packages/sdk/src/token/zama-sdk.ts` (lines 153-168 and 256-265)

## Change
Both methods should delegate to `this.credentials.revoke()` (or `this.credentials.revokeSession()`) instead of calling `sessionStorage.delete()` directly, ensuring `clearCaches()` runs.

## Accept if
The `sessionStorage.delete()` paths are functionally equivalent to the CredentialsManager path except for the missing `clearCaches()` call.

## Source
summary.md IMP-0008

# Add useQueries wrapper with shared queryKeyHashFn

## Summary
`useUserDecryptedValues` imports `useQueries` directly from `@tanstack/react-query` and manually injects `queryKeyHashFn: hashFn`. The project has a shared wrapper in `src/utils/query.ts` for `useQuery`/`useSuspenseQuery` but not for `useQueries`.

## Severity
Medium (bug — will silently diverge if hash function changes)

## Files to change
- `packages/react-sdk/src/utils/query.ts` — add `useQueries` wrapper
- `packages/react-sdk/src/relayer/use-user-decrypted-values.ts` — use the new wrapper

## Change
Add a `useQueries` wrapper to `utils/query.ts` that injects `queryKeyHashFn` into every query in the array, then use it in `use-user-decrypted-values.ts`.

## Accept if
The custom `hashFn` is a project-wide invariant that all query hooks must use.

## Source
summary.md IMP-0024


# Remove dead `=== undefined` branches in ZamaSDK

## Summary
`zama-sdk.ts` checks `this.#lastAddress === undefined` and `this.#lastChainId === undefined`, but both fields are typed `T | null` (never `undefined`) and initialized to `null`.

## Severity
Low (dead code)

## Files to change
- `packages/sdk/src/token/zama-sdk.ts` (lines 155-162)

## Change
Replace:
```ts
if (this.#lastAddress === null || this.#lastAddress === undefined || this.#lastChainId === null || this.#lastChainId === undefined)
```
With:
```ts
if (this.#lastAddress === null || this.#lastChainId === null)
```

## Source
summary.md IMP-0028

# Remove unnecessary assertion in unprefixHex

## Summary
`unprefixHex` asserts `0x` prefix on viem's `Hex` type, which is already typed as `` `0x${string}` ``. The assertion can never fail for correctly-typed callers.

## Severity
Low (dead code)

## Files to change
- `packages/sdk/src/utils.ts` (lines 14-16)

## Change
Remove the `assertCondition` and simplify to just `return value.slice(2);`.

## Accept if
All callers pass typed `Hex` values (no `as Hex` casts on unvalidated strings upstream).

## Source
summary.md IMP-0029, summary-00.md IMP-0011

