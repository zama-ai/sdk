"use client";

import { useMemo } from "react";
import type { Address, WrappedToken } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/**
 * Get a {@link WrappedToken} instance for an ERC-7984 ERC-20 wrapper,
 * memoized by address. Adds wrapper-specific operations (shield, unshield,
 * underlying, allowance) on top of the base {@link useToken} API.
 *
 * The address is the wrapper contract address itself — the wrapper IS the
 * confidential token.
 *
 * @param address - The confidential wrapper contract address.
 * @returns A memoized `WrappedToken` instance.
 *
 * @example
 * ```tsx
 * const wrapped = useWrappedToken("0xWrapper");
 * // wrapped.shield(1000n), wrapped.unshield(500n), etc.
 * ```
 */
export function useWrappedToken(address: Address): WrappedToken {
  const sdk = useZamaSDK();
  return useMemo<WrappedToken>(() => sdk.createWrappedToken(address), [sdk, address]);
}
