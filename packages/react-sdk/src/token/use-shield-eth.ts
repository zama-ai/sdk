"use client";

/**
 * Alias for {@link useWrapETH}. Wraps (shields) native ETH into confidential tokens.
 * Invalidates balance caches on success.
 *
 * @example
 * ```tsx
 * const shieldETH = useShieldETH({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * shieldETH.mutate({ amount: 1000000000000000000n }); // 1 ETH
 * ```
 */
export { useWrapETH as useShieldETH } from "./use-wrap-eth";
