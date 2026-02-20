"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/token-sdk";
import { useConfidentialSDK } from "../provider";

/**
 * Get a ReadonlyConfidentialToken instance, memoized by address.
 * Only supports balance queries and authorization — no wrapper needed.
 */
export function useReadonlyConfidentialToken(address: Address) {
  const sdk = useConfidentialSDK();

  return useMemo(() => sdk.createReadonlyToken(address), [sdk, address]);
}
