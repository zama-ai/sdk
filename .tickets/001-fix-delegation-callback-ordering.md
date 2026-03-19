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
