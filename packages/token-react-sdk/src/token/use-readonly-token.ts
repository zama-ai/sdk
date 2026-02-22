"use client";

import { useMemo } from "react";
import type { Address } from "@zama-fhe/token-sdk";
import { useTokenSDK } from "../provider";

/**
 * Get a ReadonlyToken instance, memoized by address.
 * Only supports balance queries and authorization — no wrapper needed.
 */
export function useReadonlyToken(address: Address) {
  const sdk = useTokenSDK();

  return useMemo(() => sdk.createReadonlyToken(address), [sdk, address]);
}
