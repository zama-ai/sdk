"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";

export interface UseConfidentialTokenConfig {
  tokenAddress: Address;
  wrapperAddress?: Address;
}

/**
 * Get a ConfidentialToken instance, memoized by address.
 * Reads signer and storage from the SDK context.
 */
export function useConfidentialToken(config: UseConfidentialTokenConfig) {
  const sdk = useTokenSDK();

  return useMemo(
    () => sdk.createToken(config.tokenAddress, config.wrapperAddress),
    [sdk, config.tokenAddress, config.wrapperAddress],
  );
}
