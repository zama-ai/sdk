"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/sdk";
import { useZamaSDK } from "../provider";

/** Base configuration shared by all mutation hooks that need a Token instance. */
export interface UseZamaConfig {
  /** Address of the confidential token contract. */
  tokenAddress: Address;
  /** Address of the wrapper contract (required for shield/unshield operations). */
  wrapperAddress?: Address;
}

/**
 * Get a {@link Token} instance, memoized by address pair.
 * Reads signer and storage from the nearest {@link ZamaProvider}.
 *
 * @param config - Token and optional wrapper addresses.
 * @returns A memoized `Token` instance.
 *
 * @example
 * ```tsx
 * const token = useToken({ tokenAddress: "0xToken", wrapperAddress: "0xWrapper" });
 * ```
 */
export function useToken(config: UseZamaConfig) {
  const sdk = useZamaSDK();

  return useMemo(
    () => sdk.createToken(config.tokenAddress, config.wrapperAddress),
    [sdk, config.tokenAddress, config.wrapperAddress],
  );
}
