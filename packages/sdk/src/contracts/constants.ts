/** uint64 max — represents a permanent (no-expiry) delegation. */
export const MAX_UINT64 = 2n ** 64n - 1n;

/**
 * uint48 max — represents a permanent (no-expiry) operator approval.
 * `setOperator`'s `until` argument is a `uint48` timestamp; this fits in a
 * JS number (< 2^53) and mirrors {@link MAX_UINT64}'s "permanent" role.
 */
export const MAX_UINT48 = 2 ** 48 - 1;
