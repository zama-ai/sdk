"use client";

/**
 * Alias for {@link useWrap}. Wraps (shields) public ERC-20 tokens into confidential tokens.
 * Handles ERC-20 approval automatically. Invalidates balance caches on success.
 *
 * @example
 * ```tsx
 * const shield = useShield({ tokenAddress: "0x...", wrapperAddress: "0x..." });
 * shield.mutate({ amount: 1000n });
 * ```
 */
export { useWrap as useShield } from "./use-wrap";
