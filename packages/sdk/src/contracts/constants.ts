/** uint64 max — represents a permanent (no-expiry) delegation. */
export const MAX_UINT64 = 2n ** 64n - 1n;

// Duplicated rather than imported: @fhevm/sdk computes the same value
// internally but doesn't export it from any public entry point.
/**
 * Reserved wildcard sentinel address. Pass this as `contractAddress` to
 * {@link Delegations.delegateDecryption} to delegate decryption rights across
 * every confidential contract the delegator owns — current and future —
 * instead of enumerating each contract individually.
 *
 * `ACL.sol`'s `isHandleDelegatedForUserDecryption` honors this address for
 * any `(handle, contractAddress)` pair, not just the literal sentinel — but
 * its raw per-contract expiry getter doesn't, so querying a specific contract
 * directly misses a wildcard-only grant. {@link Delegations.getStatus} and
 * {@link Delegations.getExpiry} fall back to the wildcard row themselves, so
 * status reads stay correct either way.
 */
export const WILDCARD_CONTRACT = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF" as const;
