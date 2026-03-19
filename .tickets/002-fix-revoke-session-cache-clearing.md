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
