"use client";

import { useMemo } from "react";
import type { Address, Token } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link Token} instance for an ERC-7984 confidential token, memoized by address.
 * Supports balance queries, transfers, and operator approval.
 *
 * For ERC-7984 wrappers (shield/unshield), use {@link useWrappedToken} instead.
 *
 * @param address - The confidential token contract address.
 * @returns A memoized `Token` instance.
 *
 * @example
 * ```tsx
 * const token = useToken("0xToken");
 * // token.balanceOf(), token.confidentialTransfer(), etc.
 * ```
 */
export function useToken(address: Address): Token {
  const sdk = useZamaSDK();
  return useMemo<Token>(() => sdk.tokens.confidential(address), [sdk, address]);
}
