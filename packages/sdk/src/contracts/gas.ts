/**
 * Safe gas limit for FHE-heavy contract calls.
 *
 * MetaMask applies an internal safety cap of 2^24 (16,777,216) and rejects
 * transactions whose `eth_estimateGas` result exceeds it. FHE operations on
 * Sepolia routinely estimate ~21M gas, triggering this cap. Providing an
 * explicit `gas` value bypasses the estimate and lets the wallet submit the
 * transaction. Actual consumption is typically < 2M.
 */
export const FHE_GAS_LIMIT = 5_000_000n;
