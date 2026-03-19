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
