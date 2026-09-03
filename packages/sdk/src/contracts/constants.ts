/** uint64 max — represents a permanent (no-expiry) delegation. */
export const MAX_UINT64 = 2n ** 64n - 1n;

/**
 * uint48 max — represents a permanent (no-expiry) operator approval.
 * `setOperator`'s `until` argument is a `uint48` timestamp; this fits in a
 * JS number (`< 2^53`) and mirrors {@link MAX_UINT64}'s "permanent" role.
 */
export const MAX_UINT48 = 2 ** 48 - 1;

// Duplicated rather than imported: @fhevm/sdk computes the same value
// internally but doesn't export it from any public entry point.
/**
 * Reserved wildcard sentinel address. Pass this as `contractAddress` to
 * {@link Delegations.delegateDecryption} to delegate decryption rights across
 * every confidential contract the delegator owns — current and future —
 * instead of enumerating each contract individually. `ACL.sol` recognizes
 * this address and honors it for any `(handle, contractAddress)` pair
 * checked via `isHandleDelegatedForUserDecryption`, not just the literal
 * sentinel itself.
 */
export const WILDCARD_CONTRACT = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF" as const;
