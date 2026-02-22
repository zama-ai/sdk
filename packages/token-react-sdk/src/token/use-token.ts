"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";

export interface UseTokenConfig {
  tokenAddress: Address;
  wrapperAddress?: Address;
}

/**
 * Get a Token instance, memoized by address.
 * Reads signer and storage from the SDK context.
 */
export function useToken(config: UseTokenConfig) {
  const sdk = useTokenSDK();

  return useMemo(
    () => sdk.createToken(config.tokenAddress, config.wrapperAddress),
    [sdk, config.tokenAddress, config.wrapperAddress],
  );
}
