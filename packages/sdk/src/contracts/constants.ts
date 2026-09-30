/** uint64 max — represents a permanent (no-expiry) delegation. */
export const MAX_UINT64 = 2n ** 64n - 1n;

// Duplicated rather than imported: @fhevm/sdk computes the same value
// internally but doesn't export it from any public entry point.
/**
 * `contractAddress` covering every confidential contract with a single
 * delegation.
 */
export const WILDCARD_CONTRACT = "0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF" as const;
